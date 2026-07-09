import { redirect } from "next/navigation";

export default function LegacySpellingPage() {
  redirect("/spelling-words");
}