const { POST } = require('./.next/server/app/api/campaign/schedule/route.js');

async function test() {
  const req = {
    json: async () => ({
      rows: [ { email: "test1@test.com", company: "Test 1" }, { email: "test2@test.com", company: "Test 2" } ],
      prompt: "Test prompt",
      emailColumn: "email",
      nameColumn: "company",
      schedules: [
        { dayIndex: 1, rangeStart: 1, rangeEnd: 2, times: ["08:00"] }
      ],
      settings: { timezone: "Europe/Paris" }
    })
  };

  try {
    const res = await POST(req);
    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Data:", data);
  } catch (err) {
    console.error("Crash:", err);
  }
}

test();
