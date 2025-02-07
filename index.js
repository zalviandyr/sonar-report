import puppeteer from "puppeteer";
import { mkConfig, generateCsv, asString } from "export-to-csv";
import { writeFile } from "node:fs";
import { Buffer } from "node:buffer";

const usernameFreeIPA = "";
const passwordFreeIPA = "";

const chunk = (a, n) =>
  [...Array(Math.ceil(a.length / n))].map((_, i) => a.slice(n * i, n + n * i));

const rating = {
  "1.0": "A",
  "2.0": "B",
  "3.0": "C",
  "4.0": "D",
  "5.0": "E",
};

(async () => {
  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Navigate the page to a URL
  await page.goto("https://sonar.javan.co.id", { waitUntil: "domcontentloaded" });

  const submit = await page.waitForSelector(".login-form .button");
  const username = await page.waitForSelector("#login");
  const password = await page.waitForSelector("#password");
  await username.type(usernameFreeIPA);
  await password.type(passwordFreeIPA);

  await submit.click();
  await page.waitForNavigation({ waitUntil: "networkidle0" });

  const cookies = await page.cookies();
  const jwtSession = cookies.find((e) => e.name === "JWT-SESSION").value;
  const xsrfToken = cookies.find((e) => e.name === "XSRF-TOKEN").value;

  // get all projects
  const response = await fetch("https://sonar.javan.co.id/api/components/search_projects?ps=500", {
    headers: {
      accept: "application/json",
      cookie: `XSRF-TOKEN=${xsrfToken}; JWT-SESSION=${jwtSession};`,
      "x-xsrf-token": xsrfToken,
    },
    method: "GET",
  });
  const json = await response.json();
  const projects = json.components.map((e) => e.key).filter((e) => e.includes("-new"));

  // get all measures
  const projectChunks = chunk(projects, 50);
  const data = [];

  for (const projectChunk of projectChunks) {
    const projectKeys = "projectKeys=" + projectChunk.join(",");
    const metricKeys =
      "metricKeys=alert_status,bugs,reliability_rating,vulnerabilities,security_rating,security_hotspots_reviewed,security_review_rating,code_smells,sqale_rating,duplicated_lines_density,coverage,ncloc,ncloc_language_distribution,projects";
    const response1 = await fetch(
      `https://sonar.javan.co.id/api/measures/search?${projectKeys}&${metricKeys}`,
      {
        headers: {
          accept: "application/json",
          cookie: `XSRF-TOKEN=${xsrfToken}; JWT-SESSION=${jwtSession};`,
          "x-xsrf-token": xsrfToken,
        },
        method: "GET",
      }
    );
    const json1 = await response1.json();
    const measures = json1.measures;

    for (const project of projectChunk) {
      const measure = measures.filter((e) => e.component === project);
      data.push({
        project: project,
        bugs: measure.find((e) => e.metric === "bugs")?.value,
        code_smells: measure.find((e) => e.metric === "code_smells")?.value,
        coverage: measure.find((e) => e.metric === "coverage")?.value,
        duplicated_lines_density: measure.find((e) => e.metric === "duplicated_lines_density")
          ?.value,
        reliability_rating: rating[measure.find((e) => e.metric === "reliability_rating")?.value],
        security_rating: rating[measure.find((e) => e.metric === "security_rating")?.value],
        vulnerabilities: measure.find((e) => e.metric === "vulnerabilities")?.value,
      });
    }
  }

  const csvConfig = mkConfig({ useKeysAsHeaders: true });
  const csv = generateCsv(csvConfig)(data);
  const filename = `${csvConfig.filename}.csv`;
  const csvBuffer = new Uint8Array(Buffer.from(asString(csv)));

  // Write the csv file to disk
  writeFile(filename, csvBuffer, (err) => {
    if (err) throw err;
    console.log("file saved: ", filename);
  });
})();
