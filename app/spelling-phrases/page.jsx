import SpellingTrainingPage from "../components/SpellingTrainingPage.jsx";

export default async function SpellingPhrasesPage({ searchParams }) {
  const params = await searchParams;
  const requestedPracticeSource = typeof params?.source === "string" ? params.source : "";
  return <SpellingTrainingPage scope="phrase" requestedPracticeSource={requestedPracticeSource} />;
}
