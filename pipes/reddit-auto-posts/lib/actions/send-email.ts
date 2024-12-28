import nodemailer from "nodemailer";

export default async function sendEmail(
  to: string,
  password: string,
  subject: string,
  body: string
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: to,
      pass: password,
    },
  });

  // Send mail with defined transport object
  const info = await transporter.sendMail({
    from: to, // sender address
    to: to, // list of receivers
    subject: subject, // Subject line
    text: body, // plain text body
  });

  if (!info) {
    throw new Error("failed to send email");
  }
  console.log(`email sent to ${to} with subject: ${subject}`);
}
