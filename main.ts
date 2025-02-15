import { Base64 } from "https://deno.land/x/bb64@1.1.0/mod.ts";
import { encode, decode } from "https://deno.land/std@0.179.0/encoding/base64.ts";
import http from 'node:http';

function executeScript(): void {
  const data = JSON.stringify({ model: 'llava:13b' });

  const options = {
    hostname: 'localhost',
    port: 11434,
    path: '/api/generate',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = http.request(options, (res) => {
    console.log(`Status Code: ${res.statusCode}`);

    res.on('data', (chunk) => {
      console.log(`Response: ${chunk}`);
    });

    res.on('end', () => {
      console.log('Script executed successfully');
    });
  });

  req.on('error', (error) => {
    console.error('Error executing script:', error);
  });

  req.write(data);
  req.end();
}

function scheduleScriptExecution(): void {
  setInterval(executeScript, 270000); // Execute every 270 seconds (4 minutes and half)
}

async function getKeywords(image: string): Promise<string[]> {
  const body = {
    "model": "llava:13b",
    "format": "json",
    "prompt": `Describe the image as a collection of the most relevant keywords, output in JSON format. Use the following schema: { filename: string, keywords: string[] }`,
    "images": [image],
    "stream": false,
    "keep_alive": -1
  };

  const timeout = 20000; // Timeout di 20 secondi
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    // Verifica se il server è in ascolto
    const testResponse = await fetch("http://localhost:11434", {
      method: "GET",
      signal: controller.signal, // Passa il segnale di annullamento
    });

    if (testResponse.ok) {
      const response = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal, // Passa il segnale di annullamento
      });

      clearTimeout(timeoutId); // Cancella il timeout se la richiesta ha avuto successo

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const json = await response.json();
      const keywords = JSON.parse(json.response);
      return keywords?.keywords || [];
    } else {
      console.error("Server not available. Skipping image processing.");
      return [];
    }
  } catch (error) {
    console.error("Error occurred while fetching keywords:", error);
    return []; // Restituisci un array vuoto per continuare l'elaborazione
  }
}

function createFileName(keywords: string[], originalFileName: string): string {
  let newFileName = originalFileName;
  if (keywords.length > 0) {
    const fileParts = keywords.map(k => k.replace(/ /g, "_"));
    const keywordsString = fileParts.join("-");

    const fileNameWithoutExtension = originalFileName.split(".").slice(0, -1).join(".");
    const extension = originalFileName.split(".").pop()!.toLowerCase();

    // Calcola la lunghezza massima delle parole chiave
    const maxKeywordsLength = 240 - fileNameWithoutExtension.length - 1; // Accounting for the dash between keywords and filename

    // Trunca le parole chiave se necessario
    const truncatedKeywords = keywordsString.length > maxKeywordsLength ? keywordsString.substring(0, maxKeywordsLength) : keywordsString;

    newFileName = `${fileNameWithoutExtension}-${truncatedKeywords}.${extension}`;
    newFileName = newFileName.replace(/[\[<>:"/\\|?*\x00-\x1F]/g, "_"); // Replace invalid characters with an underscore
  }

  return newFileName;
}

let isProcessingComplete = false;

async function processDirectory(dir: string) {
  for await (const entry of Deno.readDir(dir)) {
    const fullPath = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      await processDirectory(fullPath); // Recursively process subdirectories
    } else if (entry.isFile && (entry.name.toLowerCase().endsWith(".jpg") || entry.name.toLowerCase().endsWith(".png") || entry.name.toLowerCase().endsWith(".jpeg"))) {
      await processImage(fullPath); // Process the image
    }
  }

  // Check if this is the root directory
  if (dir === Deno.cwd()) {
    isProcessingComplete = true;
    console.log("All images have been processed.");
  }
}

async function processImage(filePath: string) {
  try {
    const extension = filePath.split(".").pop()!.toLowerCase();
    const allowedExtensions = ["jpg", "png", "jpeg"];

    if (allowedExtensions.includes(extension)) {
      const data = await Deno.readFile(filePath);
      const b64 = encode(data);
      const keywords = await getKeywords(b64);
      const newFileName = createFileName(keywords, filePath.split("/").pop()!);

      if (newFileName) {
        const copiedFileName = `${newFileName}`;
        const maxAttempts = 5; // Numero massimo di tentativi
        let attempts = 0;

        while (attempts < maxAttempts) {
          try {
            Deno.copyFileSync(filePath, `${filePath.slice(0, filePath.lastIndexOf("/"))}/${copiedFileName}`);
            console.log(`Copied ${filePath} to ${copiedFileName}`);
            break;
          } catch (error) {
            if (error.code === "EBUSY") {
              attempts++;
              console.log(`File ${filePath} is in use, retrying in 2 seconds (attempt ${attempts}/${maxAttempts})...`);
              await new Promise(resolve => setTimeout(resolve, 2000)); // Aspetta 2 secondi prima di riprovare
            } else {
              console.error(`Error occurred while processing ${filePath}:`, error);
              break;
            }
          }
        }

        if (attempts === maxAttempts) {
          console.error(`Failed to copy ${filePath} after ${maxAttempts} attempts.`);
        }
      } else {
        console.log(`Unable to generate new filename for ${filePath}`);
      }
    } else {
      console.log(`Skipping ${filePath} (unsupported file extension)`);
    }
  } catch (error) {
    console.error(`Error occurred while processing ${filePath}:`, error);
  }
}

async function main() {
  // Call the scheduling function when the script starts
  scheduleScriptExecution();
  const currentPath = Deno.cwd();
  await processDirectory(currentPath);

  // Check if all images have been processed every 5 seconds
  const checkInterval = setInterval(() => {
    if (isProcessingComplete) {
      clearInterval(checkInterval);
      console.log("Script terminated.");
      Deno.exit(0);
    }
  }, 5000);
}

if (import.meta.main) {
  main().catch(error => console.error("An error occurred in the main function:", error));
}
