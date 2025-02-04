"use client";

const validateMedia = async(path: string): Promise<string> => {
  try {
    const response = await fetch(`http://localhost:3030/experimental/validate/media?file_path=${encodeURIComponent(path)}`);
    const result = await response.json();
    return result.status;
  } catch (error) {
    console.error("Failed to validate media:", error);
    return "Failed to validate media";
  }
};

export default validateMedia;
