#!/usr/bin/env node

import {IHelpObject, processArguments, VersionsExtractor} from "../index";

let args: IHelpObject = processArguments();


let extractor: VersionsExtractor = new VersionsExtractor(args);

extractor.process()
    .then(extractor => 
    {
        console.log(extractor);
    })
    .catch(reason =>
    {
        console.log(`Processing failed: '${reason}'!`);

        process.exit(-1);
    });

