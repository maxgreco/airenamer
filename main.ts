import { Base64 } from "https://deno.land/x/bb64@1.1.0/mod.ts";

async function getKeywords(image: string): Promise<string[]> {
  const body = {
    "model": "llava:13b",
    "format": "json",
    "prompt": `Describe the image as a collection of keywords. Output in JSON format. Use the following schema: { filename: string, keywords: string[] }`,
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
    return [];
  }
}

function truncateFileName(fileName: string): string {
  const maxLength = 254;
  if (fileName.length <= maxLength) {
    return fileName;
  }
  const extension = fileName.substring(fileName.lastIndexOf('.'));
  const truncatedName = fileName.substring(0, maxLength - extension.length);
  return truncatedName + extension;
}

function createFileName(keywords: string[], originalFileName: string): string {
  let newFileName = "";
  if (keywords.length > 0) {
    const fileParts = keywords.map(k => k.replace(/ /g, "_"));
    const fileNameWithoutExtension = originalFileName.split(".").slice(0, -1).join(".");
    const truncatedFileName = truncateFileName(fileNameWithoutExtension);
    newFileName = fileParts.join("-") + "-" + truncatedFileName;
  }
  return newFileName;
}

async function main() {
  const currentPath = Deno.cwd();
  for await (const file of Deno.readDirSync(".")) {
    if (file.isFile && (file.name.endsWith(".jpg") || file.name.endsWith(".png"))) {
      try {
        const b64 = await Base64.fromFile(`${currentPath}/${file.name}`);
        const keywords = await getKeywords(b64.toString());
        const newFileName = createFileName(keywords, file.name);
        if (newFileName) {
          const extension = file.name.split(".").pop()!;
          const copiedFileName = `${newFileName}.${extension}`;
          Deno.copyFileSync(`${currentPath}/${file.name}`, `${currentPath}/${copiedFileName}`);
          console.log(`Copied ${file.name} to ${copiedFileName}`);
        } else {
          console.log(`Unable to generate new filename for ${file.name}`);
        }
      } catch (error) {
        console.error(`Error occurred while processing ${file.name}:`, error);
      }
    }
  }
}

if (import.meta.main) {
  main().catch(error => console.error("An error occurred in the main function:", error));
}
