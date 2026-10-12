// class-validator loads libphonenumber-js (and its ~300 KiB metadata) for @IsPhoneNumber even
// though no DTO uses that decorator. The bundle gets this stub so isolate startup skips it.
// Before using @IsPhoneNumber, remove the "libphonenumber-js/max" alias in wrangler.jsonc:
// class-validator swallows the error below and would reject every phone number.
module.exports = {
  parsePhoneNumber() {
    const message = 'libphonenumber-js is stubbed in the Worker bundle (wrangler.jsonc alias)';
    console.error(message);
    throw new Error(message);
  },
};
