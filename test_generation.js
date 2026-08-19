const fetch = require("node-fetch");

async function testFullGen() {
  console.log("=== Starting Full Generation Test ===");

  let jobId;
  try {
    const genRes = await fetch("http://localhost:3000/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leads: [
          { agency_name: "Brightwing Test", website_url: "gobrightwing.com" }
        ],
        supplyCopy: "We place senior software engineers into tech companies."
      })
    });
    const gen = await genRes.json();
    jobId = gen.jobId;
    console.log("Job Started:", gen);
  } catch (err) {
    console.error("Gen failed:", err.message);
    process.exit(1);
  }

  console.log("Polling progress for job:", jobId);
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const res = await fetch(`http://localhost:3000/api/job/${jobId}`);
    const job = await res.json();
    console.log(`Poll ${i+1}: status=${job.status}, completed=${job.completed}/${job.total}, results=${job.results.length}, errors=${job.errors.length}`);
    if (job.errors.length > 0) {
      console.log("Errors encountered:", job.errors);
    }
    if (job.status === "completed" || job.status === "failed") {
      console.log("Job finished with results:", job.results);
      break;
    }
  }
}

testFullGen();
