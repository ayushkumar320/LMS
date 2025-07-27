import { CourseProgress } from "../models/courseProgress.js";
import { Course } from "../models/course.model.js";
import { catchAsync } from "../middleware/error.middleware.js";
import { AppError } from "../middleware/error.middleware.js";

/**
 * Get user's progress for a specific course
 * @route GET /api/v1/progress/:courseId
 */
export const getUserCourseProgress = catchAsync(async (req, res) => {
  // TODO: Implement get user's course progress functionality
  const {courseId} = req.params;
  const userId = req.user._id;
  const progress = await CourseProgress.findOne({course: courseId, user: userId});
  if (!progress) {
    return next(new AppError("No progress found", 404));
  }
  res.status(200).json({
    status: "success",
    data: {
      progress,
    },
  });
});

/**
 * Update progress for a specific lecture
 * @route PATCH /api/v1/progress/:courseId/lectures/:lectureId
 */
export const updateLectureProgress = catchAsync(async (req, res) => {
  // TODO: Implement update lecture progress functionality
  const {courseId, lectureId} = req.params;
  const userId = req.user._id;
  const {completed} = req.body;
  const progress = await CourseProgress.findOneAndUpdate(
    {course: courseId, user: userId, "lectures.lecture": lectureId},
    {$set: {"lectures.$.completed": completed}},
    {new: true, upsert: true}
  );
  if (!progress) {
    return next(new AppError("Progress not found", 404));
  }
  res.status(200).json({
    status: "success",
    data: {
      progress,
    },
  });
});

/**
 * Mark entire course as completed
 * @route PATCH /api/v1/progress/:courseId/complete
 */
export const markCourseAsCompleted = catchAsync(async (req, res) => {
  // TODO: Implement mark course as completed functionality
  const {courseId} = req.params;
  const userId = req.user._id;
  const progress = await CourseProgress.findOneAndUpdate(
    {course: courseId, user: userId},
    {$set: {completed: true}},
    {new: true, upsert: true}
  );
  if (!progress) {
    return next(new AppError("Progress not found", 404));
  }
  res.status(200).json({
    status: "success",
    data: {
      progress,
    },
  });
});

/**
 * Reset course progress
 * @route PATCH /api/v1/progress/:courseId/reset
 */
export const resetCourseProgress = catchAsync(async (req, res) => {
  // TODO: Implement reset course progress functionality
  const {courseId} = req.params;
  const userId = req.user._id;
  const progress = await CourseProgress.findOneAndUpdate(
    {course: courseId, user: userId},
    {$set: {completed: false, lectures: []}},
    {new: true, upsert: true}
  );
  if (!progress) {
    return next(new AppError("Progress not found", 404));
  }
  res.status(200).json({
    status: "success",
    data: {
      progress,
    },
  });
});
