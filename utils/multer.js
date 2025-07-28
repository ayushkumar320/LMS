import multer from "multer";

// Configure multer to store uploaded files in the 'uploads/' directory
const upload = multer({dest: "uploads/"});
export default upload;
