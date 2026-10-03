// JSON encodes -0 as 0. Normalize computed values before validation and serialization.
const zero=value=>value===0?0:value;
module.exports={zero};
