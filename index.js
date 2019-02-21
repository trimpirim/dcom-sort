const dicom = require('dicomjs');
const fs = require('fs');
const path = require('path');
const shell = require('shelljs');
const readdirp = require('readdirp');

const dir = './dcom';

function files(dir = dir) {
    return new Promise((resolve, reject) => {
        readdirp({root: dir}, (file => {
        }), (error, files) => {
            if (error) {
                reject(error);
            }

            resolve(files.files);
        });
    });  
}

function parse(file) {
    return new Promise((resolve, reject) => {
        dicom.parseFile(file.fullPath, (err, data) => {
            resolve(appendAdditional({
                filePath: file.fullPath,
                file,
                dataset: data.dataset
            }));
        });
    });
}

function appendAdditional(file) {
    return {
        ...file,
        additional: {
            studyID: file.dataset['00200010'] ? file.dataset['00200010'].value : null,
            studyDescription: file.dataset['00081030'] ? file.dataset['00081030'].value : null,
            instanceNumber: file.dataset['00200013'] ? parseInt(file.dataset['00200013'].value) : null,
            sliceLocation: file.dataset['00201041'] ? parseFloat(file.dataset['00201041'].value) : null,
            acquisitionTime: file.dataset['00080032'] ? parseFloat(file.dataset['00080032'].value) : null,
            contentTime: file.dataset['00080033'] ? parseFloat(file.dataset['00080033'].value) : null,
            seriesNumber: file.dataset['00200011'] ? parseInt(file.dataset['00200011'].value) : null,
            imageType: file.dataset['00080008'] ? file.dataset['00080008'].value : null
        }
    }
}

files(dir)
    .then(async (files) => {
        const promises = [];

        files.filter(file => {
            return path.extname(file.name) === '.dcm';
        }).forEach(async file => {
            promises.push(parse(file));
        });

        const joinedPromise = Promise.all(promises);

        try {
            const result = await joinedPromise;
            const sorted = result.sort((a, b) => {
                if (a.additional.imageType.localeCompare(b.additional.imageType) === 0 ) {
                    if (a.additional.studyID === b.additional.studyID) {
                        if (a.additional.seriesNumber === b.additional.seriesNumber) {
                            if (a.additional.instanceNumber === b.additional.instanceNumber) {
                                if (a.additional.sliceLocation === b.additional.sliceLocation) {
                                    return a.additional.acquisitionTime - b.additional.acquisitionTime;
                                } else {
                                    return a.additional.sliceLocation - b.additional.sliceLocation;
                                }
                            } else {
                                return a.additional.instanceNumber - b.additional.instanceNumber;
                            }
                        } else {
                            return a.additional.seriesNumber - b.additional.seriesNumber
                        }
                    } else {
                        return a.additional.studyID - b.additional.studyID;
                    }
                } else {
                    return a.additional.imageType.localeCompare(b.additional.imageType);
                }
            });

            const withLocalizers = sorted.filter(item => item.additional.imageType.toLowerCase().includes('localizer'));
            const modified = [
                ...sorted.filter((item) => !item.additional.imageType.toLowerCase().includes('localizer')),
                ...withLocalizers
            ];

            shell.exec('rm -rf ./sorted && mkdir ./sorted')

            modified.forEach((item, index) => {
                delete item['dataset'];

                shell.exec(`cp ${item.filePath} ./sorted/${index}.dcm`)
            });
        } catch (e) {
            console.log("ERROR", e);
        }
    }).catch(error => {
        console.log('error', e);
    });