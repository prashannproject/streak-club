import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/forms";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Secure your account" };

export default async function ChangePasswordPage() {
  const user = await requireUser({ allowPasswordChange: true });
  return (
    <main className="authPage">
      <section className="authCard glass">
        <span className="eyebrow">FIRST THING FIRST</span>
        <h1>Make it yours, {user.emoji}</h1>
        <p className="lede">
          Replace the temporary password before entering the club.
        </p>
        <ChangePasswordForm />
      </section>
    </main>
  );
}
