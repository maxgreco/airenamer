import { Base64 } from "https://deno.land/x/bb64@1.1.0/mod.ts";

async function getKeywords(image: string): Promise<string[]> {
  const body = {
    "model": "llava:13b",
    "format": "json",
    "prompt": `Describe the image as a collection of the most relevant keywords, max 10. Output in JSON format. Use the following schema: { filename: string, keywords: string[] }`,
    "images": [image],
    "stream": false
  };

  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = await response.json();
    const keywords = JSON.parse(json.response);
    return keywords?.keywords || [];
  } catch (error) {
    console.error("Error occurred while fetching keywords:", error);
    throw error;
  }
}

function truncateFileName(fileName: string): string {
  const maxLength = 250;
  if (fileName.length <= maxLength) {
    return fileName;
  }

  const extensionIndex = fileName.lastIndexOf('.');
  const extension = fileName.substring(extensionIndex);
  const truncatedName = fileName.substring(0, maxLength - extension.length);
  return truncatedName + extension;
}

function createFileName(keywords: string[], originalFileName: string): string {
  let newFileName = "";
  if (keywords.length > 0) {
    const fileParts = keywords.map(k => k.replace(/ /g, "_"));
    const fileNameWithoutExtension = originalFileName.split(".").slice(0, -1).join(".");
    const truncatedFileName = truncateFileName(fileNameWithoutExtension);
    const keywordsString = fileParts.join("-");

    // Truncate keywords if necessary
    const maxKeywordsLength = 250 - truncatedFileName.length - 1; // Account for the dash between keywords and filename
    const truncatedKeywords = keywordsString.length > maxKeywordsLength ? keywordsString.substring(0, maxKeywordsLength) : keywordsString;

    newFileName = truncateFileName(truncatedKeywords + "-" + truncatedFileName);
    newFileName = newFileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_"); // Replace invalid characters with an underscore
  }
  return newFileName;
}

async function processDirectory(dir: string) {
  for await (const entry of Deno.readDir(dir)) {
    const fullPath = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      await processDirectory(fullPath); // Ricorsivamente processa le sottodirectory
    } else if (entry.isFile && (entry.name.endsWith(".jpg") || entry.name.endsWith(".png"))) {
      await processImage(fullPath); // Processa l'immagine
    }
  }
}

async function processImage(filePath: string) {
  try {
    const b64 = await Base64.fromFile(filePath);
    const keywords = await getKeywords(b64.toString());
    const newFileName = createFileName(keywords, filePath.split("/").pop()!);
    if (newFileName) {
      const extension = filePath.split(".").pop()!;
      const copiedFileName = `${newFileName}.${extension}`;
      Deno.copyFileSync(filePath, `${filePath.slice(0, filePath.lastIndexOf("/"))}/${copiedFileName}`);
      console.log(`Copied ${filePath} to ${copiedFileName}`);
    } else {
      console.log(`Unable to generate new filename for ${filePath}`);
    }
  } catch (error) {
    console.error(`Error occurred while processing ${filePath}:`, error);
  }
}

async function main() {
  const currentPath = Deno.cwd();
  await processDirectory(currentPath);
}

if (import.meta.main) {
  main().catch(error => console.error("An error occurred in the main function:", error));
}
