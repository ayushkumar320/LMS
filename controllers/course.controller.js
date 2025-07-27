import {Course} from "../models/course.model.js";
import {Lecture} from "../models/lecture.model.js";
import {User} from "../models/user.model.js";
import {deleteMediaFromCloudinary, uploadMedia} from "../utils/cloudinary.js";
import {catchAsync} from "../middleware/error.middleware.js";
import {AppError} from "../middleware/error.middleware.js";

/**
 * Create a new course
 * @route POST /api/v1/courses
 */
export const createNewCourse = catchAsync(async (req, res) => {
  // TODO: Implement create new course functionality
  const {title, description, price, thumbnail} = req.body;
  const instructorId = req.user._id;

  // Upload thumbnail to cloudinary
  const thumbnailResult = await uploadMedia(thumbnail);
  const newCourse = await Course.create({
    title,
    description,
    price,
    thumbnail: thumbnailResult.secure_url,
    instructor: instructorId,
  });

  res.status(201).json({
    status: "success",
    data: {
      course: newCourse,
    },
  });
});

/**
 * Search courses with filters
 * @route GET /api/v1/courses/search
 */
export const searchCourses = catchAsync(async (req, res) => {
  // TODO: Implement search courses functionality
  const {title, category, level, priceRange} = req.query;
  const filters = {};
  if (title) filters.title = {$regex: title, $options: "i"};
  if (category) filters.category = category;
  if (level) filters.level = level;
  if (priceRange) {
    const [minPrice, maxPrice] = priceRange.split("-");
    filters.price = {$gte: minPrice, $lte: maxPrice};
  }
  const courses = await Course.find(filters).populate(
    "instructor",
    "name email"
  );
  res.status(200).json({
    status: "success",
    results: courses.length,
    data: {
      courses,
    },
  });
});

/**
 * Get all published courses
 * @route GET /api/v1/courses/published
 */
export const getPublishedCourses = catchAsync(async (req, res) => {
  // TODO: Implement get published courses functionality
  const courses = await Course.find({isPublished: true})
    .populate("instructor", "name email")
    .populate("lectures");
  res.status(200).json({
    status: "success",
    results: courses.length,
    data: {
      courses,
    },
  });
});

/**
 * Get courses created by the current user
 * @route GET /api/v1/courses/my-courses
 */
export const getMyCreatedCourses = catchAsync(async (req, res) => {
  // TODO: Implement get my created courses functionality
  const instructorId = req.user._id;
  const courses = await Course.find({instructor: instructorId})
    .populate("instructor", "name email")
    .populate("lectures");
  res.status(200).json({
    status: "success",
    results: courses.length,
    data: {
      courses,
    },
  });
});

/**
 * Update course details
 * @route PATCH /api/v1/courses/:courseId
 */
export const updateCourseDetails = catchAsync(async (req, res, next) => {
  // TODO: Implement update course details functionality
  const {courseId} = req.params;
  const {title, description, price, thumbnail} = req.body;
  const course = await Course.findById(courseId);
  if (!course) {
    return next(new AppError("Course not found", 404));
  }
  if (thumbnail) {
    // Upload new thumbnail if provided
    const thumbnailResult = await uploadMedia(thumbnail);
    course.thumbnail = thumbnailResult.secure_url;
  }
  course.title = title || course.title;
  course.description = description || course.description;
  course.price = price || course.price;
  await course.save();
  res.status(200).json({
    status: "success",
    data: {
      course,
    },
  });
});

/**
 * Get course by ID
 * @route GET /api/v1/courses/:courseId
 */
export const getCourseDetails = catchAsync(async (req, res, next) => {
  // TODO: Implement get course details functionality
  const {courseId} = req.params;
  const course = await Course.findById(courseId)
    .populate("instructor", "name email")
    .populate("lectures");
  if (!course) {
    return next(new AppError("Course not found", 404));
  }
  res.status(200).json({
    status: "success",
    data: {
      course,
    },
  });
});

/**
 * Add lecture to course
 * @route POST /api/v1/courses/:courseId/lectures
 */
export const addLectureToCourse = catchAsync(async (req, res, next) => {
  // TODO: Implement add lecture to course functionality
  const {courseId} = req.params;
  const {title, description, videoUrl} = req.body;
  const course = await Course.findById(courseId);
  if (!course) {
    return next(new AppError("Course not found", 404));
  }
  const newLecture = await Lecture.create({
    title,
    description,
    videoUrl,
    course: courseId,
  });
  course.lectures.push(newLecture._id);
  await course.save();
  res.status(201).json({
    status: "success",
    data: {
      lecture: newLecture,
    },
  });
});

/**
 * Get course lectures
 * @route GET /api/v1/courses/:courseId/lectures
 */
export const getCourseLectures = catchAsync(async (req, res, next) => {
  const {courseId} = req.params;
  const course = await Course.findById(courseId).populate("lectures");
  if (!course) {
    return next(new AppError("Course not found", 404));
  }
  res.status(200).json({
    status: "success",
    results: course.lectures.length,
    data: {
      lectures: course.lectures,
    },
  });
});
