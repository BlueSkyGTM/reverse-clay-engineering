import { spawn } from 'child_process';

/**
 * Executes a Python script and returns the JSON output.
 * @param {string} scriptPath - Path to the .py file.
 * @param {Object} data - JSON data to pass to the script via stdin.
 */
export function runPythonScript(scriptPath, data) {
  return new Promise((resolve, reject) => {
    const py = spawn('python3', [scriptPath]);
    let output = '';
    let error = '';

    py.stdin.write(JSON.stringify(data));
    py.stdin.end();

    py.stdout.on('data', (d) => { output += d.toString(); });
    py.stderr.on('data', (d) => { error += d.toString(); });

    py.on('close', (code) => {
      if (code !== 0) return reject(new Error(`Python Error [${code}]: ${error}`));
      try {
        resolve(JSON.parse(output));
      } catch (e) {
        reject(new Error(`Failed to parse Python output: ${output}`));
      }
    });
  });
}
