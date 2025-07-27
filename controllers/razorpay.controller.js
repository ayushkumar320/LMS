import Razorpay from "razorpay";
import crypto from "crypto";
import {Course} from "../models/course.model.js";
import {CoursePurchase} from "../models/coursePurchase.model.js";
import {User} from "../models/user.model.js";
import {catchAsync} from "../middleware/error.middleware.js";
import {AppError} from "../middleware/error.middleware.js";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Create Razorpay order for course purchase
 * @route POST /api/v1/razorpay/create-order
 */
export const createRazorpayOrder = catchAsync(async (req, res, next) => {
  const {courseId} = req.body;
  const userId = req.user._id;

  // Validate course exists
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

  // Create Razorpay order
  const options = {
    amount: Math.round(course.price * 100), // Amount in paise (INR)
    currency: "INR",
    receipt: `course_${courseId}_${userId}_${Date.now()}`,
    notes: {
      courseId: courseId.toString(),
      userId: userId.toString(),
      courseName: course.title,
    },
  };

  try {
    const order = await razorpay.orders.create(options);

    // Create pending purchase record
    await CoursePurchase.create({
      userId,
      courseId,
      amount: course.price,
      status: "pending",
      paymentId: order.id,
    });

    res.status(200).json({
      status: "success",
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        courseTitle: course.title,
        key: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    return next(new AppError("Failed to create Razorpay order", 500));
  }
});

/**
 * Verify Razorpay payment signature and complete purchase
 * @route POST /api/v1/razorpay/verify-payment
 */
export const verifyPayment = catchAsync(async (req, res, next) => {
  const {razorpay_order_id, razorpay_payment_id, razorpay_signature} = req.body;
  const userId = req.user._id;

  // Verify payment signature
  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest("hex");

  const isAuthentic = expectedSignature === razorpay_signature;

  if (!isAuthentic) {
    // Update purchase status to failed
    await CoursePurchase.findOneAndUpdate(
      {paymentId: razorpay_order_id, userId, status: "pending"},
      {status: "failed"}
    );
    return next(new AppError("Payment verification failed", 400));
  }

  // Payment is verified, update purchase status
  const purchase = await CoursePurchase.findOneAndUpdate(
    {paymentId: razorpay_order_id, userId, status: "pending"},
    {
      status: "completed",
      purchaseDate: new Date(),
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    },
    {new: true}
  ).populate("courseId");

  if (!purchase) {
    return next(new AppError("Purchase record not found", 404));
  }

  // Add course to user's enrolled courses
  const user = await User.findById(userId);
  if (user && !user.enrolledCourses.includes(purchase.courseId._id)) {
    user.enrolledCourses.push(purchase.courseId._id);
    await user.save();
  }

  res.status(200).json({
    status: "success",
    message: "Payment verified successfully",
    data: {
      purchase: {
        courseId: purchase.courseId._id,
        courseName: purchase.courseId.title,
        purchaseDate: purchase.purchaseDate,
        amount: purchase.amount,
        paymentId: razorpay_payment_id,
      },
    },
  });
});

/**
 * Handle payment failure
 * @route POST /api/v1/razorpay/payment-failed
 */
export const handlePaymentFailure = catchAsync(async (req, res, next) => {
  const {razorpay_order_id, error} = req.body;
  const userId = req.user._id;

  // Update purchase status to failed
  const purchase = await CoursePurchase.findOneAndUpdate(
    {paymentId: razorpay_order_id, userId, status: "pending"},
    {
      status: "failed",
      failureReason: error?.description || "Payment failed",
    },
    {new: true}
  );

  if (!purchase) {
    return next(new AppError("Purchase record not found", 404));
  }

  res.status(200).json({
    status: "success",
    message: "Payment failure recorded",
    data: {
      orderId: razorpay_order_id,
      failureReason: purchase.failureReason,
    },
  });
});

/**
 * Get payment status
 * @route GET /api/v1/razorpay/payment-status/:orderId
 */
export const getPaymentStatus = catchAsync(async (req, res, next) => {
  const {orderId} = req.params;
  const userId = req.user._id;

  const purchase = await CoursePurchase.findOne({
    paymentId: orderId,
    userId,
  }).populate("courseId", "title thumbnail");

  if (!purchase) {
    return next(new AppError("Payment record not found", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      purchase: {
        orderId: purchase.paymentId,
        status: purchase.status,
        amount: purchase.amount,
        course: purchase.courseId,
        purchaseDate: purchase.purchaseDate,
        failureReason: purchase.failureReason,
      },
    },
  });
});
