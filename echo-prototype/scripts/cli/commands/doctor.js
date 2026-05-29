const { printDoctorResults } = require("./helpers");

function run() {
  const { runDoctor } = require("../../lib/usecases/run-doctor");
  const results = runDoctor({ hookOnly: false });
  console.log("Workspace health check:\n");
  printDoctorResults(results);
}

module.exports = run;
