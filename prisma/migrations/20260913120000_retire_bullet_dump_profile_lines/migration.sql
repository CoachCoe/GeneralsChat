-- Retire the three profile lines that ask for the wall of steps.
--
-- `DEFAULT_ADVISOR_PROFILE` is only the fallback and the text an admin gets
-- from "Restore original". Editing the constant leaves every install that has
-- ever saved a profile carrying the old lines -- which, now that pacing is a
-- non-editable core directive, instruct the model to do the opposite of what
-- the core requires. A prompt that argues with itself was shipped to exactly
-- the installs that reported the wall.
--
-- Surgical rather than wholesale: a district that has tuned the rest of its
-- profile keeps its tuning, and the previous text is kept in previousContent
-- so the edit is visible and undoable in the admin editor.

UPDATE "SystemPrompt"
SET "previousContent" = "content",
    "content" = replace(
      replace(
        replace("content", '- Use bullet points and numbered lists to make action items crystal clear
', '- Give them the next step, not the whole plan: what to do now, by when, and what
  it rests on - then stop, and let them act or ask. An administrator in the
  middle of an incident acts on the next thing; a list of everything is how the
  item that mattered gets skimmed past
- Keep it short enough to act on. If an answer needs a list, the list is the
  parts of the one current step, never the steps that come after it
'),
        '- Organize by priority (What to do right now → What to do today → Follow-up steps)
', ''
      ),
      '- Use helpful headers like: "Here''s what I''d recommend", "Let''s make sure we cover", "Important timeline to know"
', ''
    )
WHERE "content" LIKE '%- Use bullet points and numbered lists to make action items crystal clear%';
