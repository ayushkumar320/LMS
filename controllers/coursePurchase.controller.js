import Stripe from "stripe";
import {Course} from "../models/course.model.js";
import {CoursePurchase} from "../models/coursePurchase.model.js";
import {Lecture} from "../models/lecture.model.js";
import {User} from "../models/user.model.js";
import {catchAsync} from "../middleware/error.middleware.js";
import {AppError} from "../middleware/error.middleware.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Create a Stripe checkout session for course purchase
 * @route POST /api/v1/payments/create-checkout-session
 */
export const initiateStripeCheckout = catchAsync(async (req, res, next) => {
  const {courseId} = req.body;
  const userId = req.user._id;

  // Check if course exists
  const course = await Course.findById(courseId);
  if (!course) {
    return next(new AppError("Course not found", 404));
  }

  // Check if user already purchased the course
  const existingPurchase = await CoursePurchase.findOne({
    userId,
    courseId,
    status: "completed",
  });

  if (existingPurchase) {
    return next(new AppError("Course already purchased", 400));
  }

  // Create Stripe checkout session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: course.title,
            description: course.description,
            images: course.thumbnail ? [course.thumbnail] : [],
          },
          unit_amount: Math.round(course.price * 100), // Convert to cents
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${process.env.FRONTEND_URL}/course-access/${courseId}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/course/${courseId}`,
    metadata: {
      courseId: courseId.toString(),
      userId: userId.toString(),
    },
  });

  // Create pending purchase record
  await CoursePurchase.create({
    userId,
    courseId,
    amount: course.price,
    status: "pending",
    paymentId: session.id,
  });

  res.status(200).json({
    status: "success",
    data: {
      sessionId: session.id,
      sessionUrl: session.url,
    },
  });
});

/**
 * Handle Stripe webhook events
 * @route POST /api/v1/payments/webhook
 */
export const handleStripeWebhook = catchAsync(async (req, res, next) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.log(`Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case "checkout.session.completed":
      const session = event.data.object;

      // Update purchase status
      const purchase = await CoursePurchase.findOne({
        paymentId: session.id,
        status: "pending",
      });

      if (purchase) {
        purchase.status = "completed";
        purchase.purchaseDate = new Date();
        await purchase.save();

        // Add course to user's enrolled courses
        const user = await User.findById(purchase.userId);
        if (user && !user.enrolledCourses.includes(purchase.courseId)) {
          user.enrolledCourses.push(purchase.courseId);
          await user.save();
        }
      }
      break;

    case "checkout.session.expired":
      const expiredSession = event.data.object;

      // Update purchase status to failed
      await CoursePurchase.findOneAndUpdate(
        {paymentId: expiredSession.id, status: "pending"},
        {status: "failed"}
      );
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.status(200).json({received: true});
});

/**
 * Get course details with purchase status
 * @route GET /api/v1/payments/courses/:courseId/purchase-status
 */
export const getCoursePurchaseStatus = catchAsync(async (req, res, next) => {
  const {courseId} = req.params;
  const userId = req.user._id;

  // Check if course exists
  const course = await Course.findById(courseId)
    .populate("instructor", "name email")
    .populate("lectures");

  if (!course) {
    return next(new AppError("Course not found", 404));
  }

  // Check purchase status
  const purchase = await CoursePurchase.findOne({
    userId,
    courseId,
    status: "completed",
  });

  const isPurchased = !!purchase;

  // If purchased, return course with lectures
  // If not purchased, return course without lecture content
  const courseData = {
    ...course.toObject(),
    isPurchased,
    lectures: isPurchased
      ? course.lectures
      : course.lectures.map((lecture) => ({
          _id: lecture._id,
          title: lecture.title,
          description: lecture.description,
          duration: lecture.duration,
          isPreview: lecture.isPreview || false,
          // Don't include videoUrl for non-purchased courses unless it's a preview
          ...(lecture.isPreview && {videoUrl: lecture.videoUrl}),
        })),
  };

  res.status(200).json({
    status: "success",
    data: {
      course: courseData,
      purchaseInfo: purchase || null,
    },
  });
});

/**
 * Get all purchased courses
 * @route GET /api/v1/payments/purchased-courses
 */
export const getPurchasedCourses = catchAsync(async (req, res, next) => {
  const userId = req.user._id;

  // Get all completed purchases for the user
  const purchases = await CoursePurchase.find({
    userId,
    status: "completed",
  })
    .populate({
      path: "courseId",
      populate: {
        path: "instructor",
        select: "name email",
      },
    })
    .populate({
      path: "courseId",
      populate: {
        path: "lectures",
        select: "title description duration",
      },
    })
    .sort({purchaseDate: -1});

  // Extract courses from purchases
  const purchasedCourses = purchases.map((purchase) => ({
    ...purchase.courseId.toObject(),
    purchaseInfo: {
      purchaseDate: purchase.purchaseDate,
      amount: purchase.amount,
      paymentId: purchase.paymentId,
    },
  }));

  res.status(200).json({
    status: "success",
    results: purchasedCourses.length,
    data: {
      courses: purchasedCourses,
    },
  });
});
