import SpellingTrainingPage from "../components/SpellingTrainingPage.jsx";

export default async function SpellingWordsPage({ searchParams }) {
  const params = await searchParams;
  const requestedPracticeSource = typeof params?.source === "string" ? params.source : "";
  return <SpellingTrainingPage scope="word" requestedPracticeSource={requestedPracticeSource} />;
}
