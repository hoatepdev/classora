#!/usr/bin/env node

let raw = "";

for await (const chunk of process.stdin) {
  raw += chunk;
}

const input = JSON.parse(raw || "{}");
const filePath = input.tool_input?.file_path || "";

const sensitive = [
  /(^|\/)\.env($|\.)/,
  /\.pem$/i,
  /\.key$/i,
  /(^|\/)id_rsa$/i,
  /credentials/i,
  /secrets?\./i,
];

const allowed = [/(^|\/)\.env\.example$/];

if (
  sensitive.some((pattern) => pattern.test(filePath)) &&
  !allowed.some((pattern) => pattern.test(filePath))
) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason:
          "This file may contain credentials or secrets.",
      },
    }),
  );
}
