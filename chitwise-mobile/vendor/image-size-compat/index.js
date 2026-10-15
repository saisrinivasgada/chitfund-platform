'use strict';

const fs = require('fs');
const secureImageSize = require('image-size-secure');

/**
 * Metro 0.83 passes a file path to image-size's former callable CommonJS API.
 * image-size 2.0.4 contains the parser security fixes but accepts byte arrays
 * through a named export. Keep Metro's old contract while using the patched
 * parser until Metro adopts the new API itself.
 */
function imageSize(input) {
  const bytes = typeof input === 'string' ? fs.readFileSync(input) : input;
  return secureImageSize.imageSize(bytes);
}

imageSize.imageSize = imageSize;
imageSize.default = imageSize;
imageSize.disableTypes = secureImageSize.disableTypes;
imageSize.types = secureImageSize.types;

module.exports = imageSize;
