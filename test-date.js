const { fromZonedTime } = require("date-fns-tz");

const tz = "Europe/Paris";
const dateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: tz,
  year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

const [cYear, cMonth, cDay] = dateParts.split('-').map(Number);
const baseDate = new Date(Date.UTC(cYear, cMonth - 1, cDay));

const s = { dayIndex: 1, times: ["08:00"] };

const targetDate = new Date(baseDate);
targetDate.setUTCDate(targetDate.getUTCDate() + (s.dayIndex - 1));
const targetDateStr = targetDate.toISOString().split('T')[0];

const localTimeStr = `${targetDateStr} 08:00:00`;
const scheduledTimeUTC = fromZonedTime(localTimeStr, tz);

console.log("localTimeStr:", localTimeStr);
console.log("scheduledTimeUTC ISO:", scheduledTimeUTC.toISOString());
console.log("scheduledTimeUTC local?:", scheduledTimeUTC.toString());
