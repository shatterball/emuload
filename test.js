const MultipartDownload = require('./dist/src');

new MultipartDownload()
  .start('http://212.183.159.230/50MB.zip', {
    numOfConnections: 4,
    saveDirectory: '/home/rohan',
    fileName: '50.zip',
  })
  .on('error', (err) => {
    // handle error here
  })
  .on('data', (data, offset) => {
    // manipulate data here
  })
  .on('end', (filePath) => {
    console.log(`Downloaded file path: ${filePath}`);
  });
