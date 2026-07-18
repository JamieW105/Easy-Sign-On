import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const imageName = "easy-sign-on:latest";
const outputDir = resolve("docker-images");
const outputPath = resolve(outputDir, "easy-sign-on-latest.tar");
const composePath = resolve("compose.yaml");
const outputComposePath = resolve(outputDir, "compose.yaml");

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("docker", ["build", "--tag", imageName, "."]);

mkdirSync(outputDir, { recursive: true });
run("docker", ["save", "--output", outputPath, imageName]);
copyFileSync(composePath, outputComposePath);

const sizeMb = (statSync(outputPath).size / 1024 / 1024).toFixed(1);
console.log(`Exported ${imageName} to ${outputPath} (${sizeMb} MiB).`);
console.log(`Copied Compose file to ${outputComposePath}.`);
console.log(`Load it with: docker load --input "${outputPath}"`);
