"use server";
import nodemailer from "nodemailer";

export default async function sendEmail(
  to: string,
  password: string,
  subject: string,
  body: string
): Promise<void> {

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: to,
        pass: password,
      },
    });
    const info = await transporter.sendMail({
      from: to,
      to: to,
      subject: subject,
      text: body,
    });
    if (!info) {
      throw new Error("failed to send email, no info found");
    }
  } catch (error){
    throw new Error(`failed to send email ${error}`);
  }
  console.log(`email sent to ${to} with subject: ${subject}`);
}
