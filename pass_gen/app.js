var crypto = require("crypto");
var readline = require("readline");
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function genHash(input){
    return Buffer.from(crypto.createHash('sha256').update(input).digest('base32')).toString('hex').toUpperCase();
}

rl.question("Whats the input?", resp=>{
    console.log(genHash(resp));
});

