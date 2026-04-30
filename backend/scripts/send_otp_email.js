const nodemailer = require("nodemailer");

async function main() {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const filteredArgs = args.filter((arg) => arg !== "--verify-only");
  const [recipientEmail, otpCode, expiryMinutesArg] = filteredArgs;

  const smtpHost = process.env.SMTP_SERVER || "smtp.gmail.com";
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUsername = process.env.SMTP_USERNAME;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const expiryMinutes = Number(expiryMinutesArg || 10);

  if (!smtpUsername || !smtpPassword) {
    throw new Error("SMTP_USERNAME and SMTP_PASSWORD must be set.");
  }

  if (!verifyOnly && (!recipientEmail || !otpCode)) {
    throw new Error("Recipient email and OTP code are required.");
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUsername,
      pass: smtpPassword,
    },
  });

  await transporter.verify();

  if (verifyOnly) {
    process.stdout.write(JSON.stringify({ success: true, verified: true }));
    return;
  }

  await transporter.sendMail({
    from: smtpUsername,
    to: recipientEmail,
    subject: "Trainer Portal - OTP Verification",
    text: `Your Trainer Portal OTP code is ${otpCode}. It expires in ${expiryMinutes} minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <h2 style="margin-bottom: 16px;">Trainer Portal - OTP Verification</h2>
        <p>Your OTP code is: <strong style="font-size: 20px;">${otpCode}</strong></p>
        <p>This code will expire in ${expiryMinutes} minutes.</p>
        <p>If you did not request this OTP, you can ignore this email.</p>
      </div>
    `,
  });

  process.stdout.write(JSON.stringify({ success: true }));
}

main().catch((error) => {
  process.stderr.write(error.message || "Failed to send OTP email.");
  process.exit(1);
});
