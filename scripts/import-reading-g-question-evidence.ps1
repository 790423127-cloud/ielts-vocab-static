param(
  [Parameter(Mandatory = $true)]
  [string[]]$SourceArchive,
  [string]$OutputPath = (Join-Path $PSScriptRoot "..\public\data\reading-g-question-evidence.json")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Read-ZipEntryText {
  param($Zip, $Entry)

  $reader = [System.IO.StreamReader]::new($Entry.Open())
  try {
    return $reader.ReadToEnd()
  } finally {
    $reader.Dispose()
  }
}

function Get-QuestionTypeLabel {
  param([string]$Instructions)

  $text = ($Instructions -replace "\s+", " ").Trim()
  if ($text -match "Do the following statements agree") { return "判断题（TRUE / FALSE / NOT GIVEN）" }
  if ($text -match "correct ending") { return "句子结尾匹配题" }
  if ($text -match "correct heading|correct title") { return "段落标题匹配题" }
  if ($text -match "Which (paragraph|section)") { return "段落信息匹配题" }
  if ($text -match "Which ") { return "信息匹配题" }
  if ($text -match "Classify the following") { return "分类匹配题" }
  if ($text -match "Match each|For which") { return "匹配题" }
  if ($text -match "Choose (TWO|THREE|FOUR) (correct answers|letters)") { return "多选题" }
  if ($text -match "Choose the correct letter") { return "选择题" }
  if ($text -match "Complete the (flow|follow) chart") { return "流程图填空题" }
  if ($text -match "Complete the table") { return "表格填空题" }
  if ($text -match "Complete the summary") { return "摘要填空题" }
  if ($text -match "Complete the notes") { return "笔记填空题" }
  if ($text -match "Complete the sentences") { return "句子填空题" }
  if ($text -match "Label the diagram") { return "图示标签填空题" }
  if ($text -match "Answer the questions") { return "简答题" }
  if ($text -match "List the name") { return "简答填空题" }
  if ($text -match "Choose ONE WORD ONLY|Complete") { return "填空题" }
  return "原题说明待归类"
}

function Get-QuestionKey {
  param([string]$Book, [string]$Test, [string]$Part, [string]$Number)

  return "$($Book.Trim())|$($Test.Trim())|$($Part.Trim())|$($Number.Trim())"
}

$csvRows = @()
$rawQuestionsByKey = @{}
$archiveLabels = @()

foreach ($archivePath in $SourceArchive) {
  if (-not (Test-Path -LiteralPath $archivePath)) {
    throw "题源压缩包不存在：$archivePath"
  }

  $zip = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
  try {
    $archiveLabels += Split-Path -Leaf $archivePath
    $csvEntry = @($zip.Entries | Where-Object { $_.FullName -like "*csv\questions.csv" })[0]
    if (-not $csvEntry) {
      throw "题源中缺少 csv/questions.csv：$archivePath"
    }

    $csvRows += @(Read-ZipEntryText $zip $csvEntry | ConvertFrom-Csv)

    $partEntries = @($zip.Entries | Where-Object { $_.FullName -like "*raw\parts\*.json" -and $_.Length -gt 0 })
    foreach ($partEntry in $partEntries) {
      $partData = Read-ZipEntryText $zip $partEntry | ConvertFrom-Json
      $book = ([string]$partData.jianya_name -replace "^G类", "").Trim()
      $test = [string]$partData.test_name
      $part = [string]$partData.title

      foreach ($questionGroup in @($partData.question)) {
        $instructions = ([string]$questionGroup.desc -replace "\s+", " ").Trim()
        foreach ($question in @($questionGroup.list)) {
          $key = Get-QuestionKey $book $test $part ([string]$question.number)
          if ($rawQuestionsByKey.ContainsKey($key)) {
            throw "原始分卷中存在重复题号：$key"
          }
          $rawQuestionsByKey[$key] = [pscustomobject]@{
            Instructions = $instructions
            QuestionType = Get-QuestionTypeLabel $instructions
          }
        }
      }
    }
  } finally {
    $zip.Dispose()
  }
}

$questions = @()
$csvKeys = @{}
foreach ($row in $csvRows) {
  $key = Get-QuestionKey ([string]$row.book) ([string]$row.test) ([string]$row.part) ([string]$row.number)
  if ($csvKeys.ContainsKey($key)) {
    throw "questions.csv 中存在重复题号：$key"
  }
  if (-not $rawQuestionsByKey.ContainsKey($key)) {
    throw "questions.csv 题目无法映射到原始分卷：$key"
  }

  $csvKeys[$key] = $true
  $raw = $rawQuestionsByKey[$key]
  $answerSentence = [string]$row.answer_sentences
  $hasAnswerSentence = -not [string]::IsNullOrWhiteSpace($answerSentence)
  $questionLabel = [string]$row.question
  $questions += [ordered]@{
    key = $key
    book = ([string]$row.book).Trim()
    test = ([string]$row.test).Trim()
    part = ([string]$row.part).Trim()
    question = [int]$row.number
    questionLabel = $questionLabel.Trim()
    questionType = $raw.QuestionType
    instructions = $raw.Instructions
    answer = ([string]$row.answer).Trim()
    answerSentence = $answerSentence.Trim()
    answerSentenceStatus = if ($hasAnswerSentence) { "available" } else { "needs_location" }
  }
}

$unmappedRawKeys = @($rawQuestionsByKey.Keys | Where-Object { -not $csvKeys.ContainsKey($_) })
if ($unmappedRawKeys.Count) {
  throw "原始分卷中有题目未进入 questions.csv：$($unmappedRawKeys -join '; ')"
}

$questions = @($questions | Sort-Object book, test, part, question)
$answerSentenceAvailable = @($questions | Where-Object { $_.answerSentenceStatus -eq "available" }).Count
$questionLabelAvailable = @($questions | Where-Object { $_.questionLabel }).Count
$typeAvailable = @($questions | Where-Object { $_.questionType -and $_.questionType -ne "原题说明待归类" }).Count

$payload = [ordered]@{
  version = "reading-g-question-evidence-v1"
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  sourceArchives = $archiveLabels
  count = $questions.Count
  coverage = [ordered]@{
    questionType = [ordered]@{ available = $typeAvailable; pending = $questions.Count - $typeAvailable }
    questionLabel = [ordered]@{ available = $questionLabelAvailable; pending = $questions.Count - $questionLabelAvailable }
    answerSentence = [ordered]@{ available = $answerSentenceAvailable; pending = $questions.Count - $answerSentenceAvailable }
  }
  questions = $questions
}

$parent = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Path $parent -Force | Out-Null
$temporaryPath = "$OutputPath.tmp-$PID-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
$json = $payload | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($temporaryPath, $json, [System.Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temporaryPath -Destination $OutputPath -Force

[pscustomobject]@{
  OutputPath = $OutputPath
  Count = $questions.Count
  AnswerSentenceAvailable = $answerSentenceAvailable
  AnswerSentencePending = $questions.Count - $answerSentenceAvailable
  QuestionTypeAvailable = $typeAvailable
  QuestionTypePending = $questions.Count - $typeAvailable
  QuestionLabelAvailable = $questionLabelAvailable
  QuestionLabelPending = $questions.Count - $questionLabelAvailable
} | ConvertTo-Json
