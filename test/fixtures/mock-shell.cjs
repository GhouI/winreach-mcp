#!/usr/bin/env node

const commandIndex = process.argv.findIndex((arg) => arg.toLowerCase() === "-command");
const command = commandIndex >= 0 ? process.argv[commandIndex + 1] ?? "" : "";

if (command === "-") {
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    const text = String(chunk);
    const marker = text.match(/__WINBRIDGE_END_[A-Za-z0-9_]+__/);
    if (text.includes("mock_set")) {
      process.stdout.write("mocked\n");
    }
    if (marker) {
      process.stdout.write(`${marker[0]}:exit=0\n`);
    }
  });
  return;
}

if (command.includes("mock_timeout")) {
  setTimeout(() => undefined, 10000);
} else if (command.includes("mock_error")) {
  process.stderr.write("mock error\n");
  process.exit(7);
} else {
  process.stdout.write(`mock stdout: ${command}\n`);
}
