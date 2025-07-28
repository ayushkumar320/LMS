import {v2 as cloudinary} from "cloudinary";
import dotenv from "dotenv";
dotenv.config({});

// Configure Cloudinary with API credentials from environment variables
cloudinary.config({
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
  cloud_name: process.env.CLOUD_NAME,
});

// Function to upload a file to Cloudinary
export const uploadMedia = async (file) => {
  try {
    // Upload the file, automatically detecting its resource type (image, video, etc.)
    const uploadResponse = await cloudinary.uploader.upload(file, {
      resource_type: "auto",
    });
    // Return the response from Cloudinary, which includes public_id, URL, etc.
    return uploadResponse;
  } catch (error) {
    // Log any errors that occur during the upload process
    console.log(error);
  }
};

// Function to delete a media file from Cloudinary using its public ID
export const deleteMediaFromCloudinary = async (publicId) => {
  try {
    // Destroy the resource on Cloudinary
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    // Log any errors that occur during the deletion process
    console.log(error);
  }
};

// Function to delete a video file from Cloudinary using its public ID
export const deleteVideoFromCloudinary = async (publicId) => {
  try {
    // Destroy the resource on Cloudinary, specifically marking it as a video
    await cloudinary.uploader.destroy(publicId, {resource_type: "video"});
  } catch (error) {
    // Log any errors that occur during the deletion process
    console.log(error);
  }
};
