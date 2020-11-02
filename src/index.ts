import * as git from "simple-git";
import * as semver from "semver";
import * as extend from "extend";
import * as commandLineArgs from "command-line-args";
import * as path from 'path';
import * as moment from 'moment';

import commandLineUsage = require("command-line-usage");
import {UsageOptionDefinition} from 'command-line-usage-options';
import {ReleaseType} from 'semver';

/**
 * Reads configuration from ENV variables
 */
function processEnvCfg(): IHelpObject
{
    let result: IHelpObject = 
    {
        config: 'ngv.config.json'
    };

    if(process.env.NGV_BRANCH_NAME)
    {
        result.branchName = process.env.NGV_BRANCH_NAME;
    }

    if(process.env.NGV_BUILD_NUMBER)
    {
        result.buildNumber = parseInt(process.env.NGV_BUILD_NUMBER!);
    }

    if(process.env.NGV_TAG_PREFIX)
    {
        result.tagPrefix = process.env.NGV_TAG_PREFIX;
    }

    if(process.env.NGV_IGNORE_BRANCH_PREFIX)
    {
        result.ignoreBranchPrefix = process.env.NGV_IGNORE_BRANCH_PREFIX;
    }

    if(process.env.NGV_PRE)
    {
        result.pre = process.env.NGV_PRE!.toLowerCase() == "true";
    }

    if(process.env.NGV_SUFFIX)
    {
        result.suffix = process.env.NGV_SUFFIX;
    }

    if(process.env.NGV_WORKING_DIRECTORY)
    {
        result.workingDirectory = process.env.NGV_WORKING_DIRECTORY;
    }

    if(process.env.NGV_CURRENT_VERSION)
    {
        result.currentVersion = process.env.NGV_CURRENT_VERSION;
    }

    if(process.env.NGV_NO_STDOUT)
    {
        result.noStdOut = process.env.NGV_NO_STDOUT!.toLowerCase() == "true";
    }

    if(process.env.NGV_EXECUTE)
    {
        result.execute = process.env.NGV_EXECUTE;
    }

    return result;
}

/**
 * Description of help parameters
 */
export interface IHelpObject
{
    help?: boolean;
    branchName?: string;
    buildNumber?: number;
    tagPrefix?: string;
    ignoreBranchPrefix?: string;
    pre?: boolean;
    suffix?: string;
    currentVersion?: string;
    workingDirectory?: string;
    noStdOut?: boolean;
    config: string;
    execute?: string;
}

/**
 * Updates build number, handling special build number -1
 * @param args Arguments that are being processed
 */
export function updateBuildNumber(args: IHelpObject)
{
    if(args.buildNumber == -1)
    {
        args.buildNumber = parseInt(moment().format("YYYYMMDDHHmmss"));
    }
}

/**
 * Process arguments and returns parsed object
 */
export function processArguments(): IHelpObject
{
    let definitions: UsageOptionDefinition[] =
    [
        { name: "help", alias: "h", type: Boolean, description: "Displays help for this command line tool." },
        { name: "branchName", type: String, description: "Name of branch used for getting version, if not specified current branch will be used, if detached error will be thrown.", typeLabel: "<branchName>", defaultOption: true },
        { name: "buildNumber", alias: "b", type: Number, description: "Build number will be used if suffix is specified, defaults to 0, possible to use -1 to autogenerate date time stamp.", typeLabel: "<buildNumber>" },
        { name: "tagPrefix", alias: "t", type: String, description: "Tag prefix (RegExp) used for pairing branch and tag for getting version.", typeLabel: "<prefix>"},
        { name: "ignoreBranchPrefix", alias: "i", type: String, description: "Branch prefix name that will be ignored (RegExp) and stripped of branch during version paring.", typeLabel: "<ignorePrefix>" },
        { name: "pre", alias: "p", type: Boolean, description: "Indication that prerelease version should be returned." },
        { name: "suffix", alias: "s", type: String, description: "Suffix that is used when prerelease version is requested, will be used as prerelease (suffix) name.", typeLabel: "<suffix>" },
        { name: "currentVersion", alias: "v", type: String, description: "Current version that will be used if it matches branch and tag as source for next version.", typeLabel: "<version>" },
        { name: "workingDirectory", alias: "w", type: String, description: "Working directory where git repository is located.", typeLabel: "<workingDirectory>" },
        { name: "noStdOut", alias: "n", type: Boolean, description: "Indication that no stdout should be written in case of success run." },
        { name: "config", alias: "c", type: String, description: "Path to configuration file." },
        { name: "execute", alias: "e", type: String, description: "Execute command with variable '$GIT_VERSION' available." }
    ];

    let args: IHelpObject = commandLineArgs(definitions) as IHelpObject;
    let envConfig = processEnvCfg();
    let fileConfig = {};

    try
    {
        let configPath = path.join(process.cwd(), envConfig.config);
        require.resolve(configPath);
        fileConfig = require(configPath);
    }
    catch(e)
    {
        if(!args.noStdOut)
        {
            console.log(`No config file '${envConfig.config}' found.`);
        }
    }

    args = extend({}, fileConfig, envConfig, args);

    updateBuildNumber(args);

    if(args.help)
    {
        console.log(commandLineUsage(
        [
            {
                header: "description",
                content:
                [
                    "Gets version of application based on branch name and existing tags",
                    "",
                    "Command:",
                    "ngv <branchName> [options]"
                ]
            },
            {
                header: "options",
                optionList: definitions
            }
        ]));

        process.exit(0);
    }

    return args;
}

/**
 * Extractor that extracts version number for current git repository
 */
export class VersionsExtractor
{
    //######################### private fields #########################

    /**
     * Instance of git wrapper
     */
    private _git: git.Git;

    /**
     * Resolve method for process method
     */
    private _processResolve: (value: VersionsExtractor) => void;

    /**
     * Reject method for process method
     */
    private _processReject: (reason: any) => void;

    /**
     * Name of current branch
     */
    private _branchName: string;

    /**
     * Name of current branch stripped only to version
     */
    private _branchVersion: string;

    /**
     * Stripped branch prefix from branch name
     */
    private _branchPrefix: string = "";

    /**
     * Number of last matching version
     */
    private _lastMatchingVersion: string;

    /**
     * Indication that tag is on current HEAD
     */
    private _currentTag: boolean = false;

    /**
     * Indication that version is new for this branch
     */
    private _startingVersion: boolean = false;

    /**
     * Computed version for next build
     */
    private _version: string;

    //######################### public properties #########################

    /**
     * Gets stripped branch prefix from branch name
     */
    public get branchPrefix(): string
    {
        return this._branchPrefix;
    }

    /**
     * Gets name of current branch
     */
    public get branchName(): string
    {
        return this._branchName;
    }

    /**
     * Gets name of current branch stripped only to version
     */
    public get branchVersion(): string
    {
        return this._branchVersion;
    }

    /**
     * Gets computed version for next build
     */
    public get version(): string
    {
        return this._version;
    }

    /**
     * Gets number of last matching version
     */
    public get lastMatchingVersion(): string
    {
        return this._lastMatchingVersion;
    }

    /**
     * Command that should be executed after version is computed
     */
    public get executeCommand(): string|undefined
    {
        return this._config.execute;
    }

    //######################### private properties #########################

    /**
     * Gets prerelease suffix
     */
    private get prereleaseSuffix(): string
    {
        if(this._config.pre)
        {
            return `${this._branchPrefix ? this._branchPrefix + "-" : ""}${this._config.suffix}`;
        }

        return "";
    }

    //######################### constructor #########################
    constructor(private _config: IHelpObject)
    {
        if(this._config.pre && !this._config.suffix)
        {
            console.error("Prerelease version was set, but no suffix was provided!");

            process.exit(-1);
        }
    }

    //######################### public methods #########################

    /**
     * Process extraction of version
     */
    public process(): Promise<VersionsExtractor>
    {
        let result = new Promise<VersionsExtractor>((resolve, reject) =>
        {
            this._processResolve = resolve;
            this._processReject = reject;
        });

        //Tests whether application is run inside git repository
        this._git = git(this._config.workingDirectory).status(this._errorHandle(() =>
        {
            if(!this._config.noStdOut)
            {
                console.log("Git repository available.");
            }
        }));

        this._runProcessing();

        return result;
    }

    //######################### private methods #########################

    /**
     * Runs internal git processing
     */
    private async _runProcessing()
    {
        this._branchName = await this._getBranchName();
        this._processBranchName();
        this._lastMatchingVersion = await this._getLastMatchingTag();
        this._computeVersion();
        this._applyBuildNumber();

        this._processResolve(this);
    }

    /**
     * Applies specified build number for prerelease version
     */
    private _applyBuildNumber(): void
    {
        //release version or current tag is on same commit as HEAD
        if(!this._config.pre || this._currentTag)
        {
            return;
        }

        //no build number or current version
        if(!this._config.buildNumber && !this._config.currentVersion)
        {
            return;
        }

        //build number higher priority
        if(this._config.buildNumber)
        {
            this._version = this._version.replace(/\d+$/g, `${this._config.buildNumber}`);

            return;
        }

        //current version specified as parameter
        if(this._config.currentVersion)
        {
            let currentVersionSemver = semver.parse(this._version);
            let originalVersionSemver = semver.parse(this._config.currentVersion);

            //invalid one of versions
            if(!currentVersionSemver || !originalVersionSemver)
            {
                this._processReject(`Unable to parse version '${this._version}' or '${this._config.currentVersion}'!`);
    
                return;
            }

            //version are in match use it as base for increment
            if(`${currentVersionSemver.major}.${currentVersionSemver.minor}.${currentVersionSemver.patch}-${currentVersionSemver.prerelease[0]}` == `${originalVersionSemver.major}.${originalVersionSemver.minor}.${originalVersionSemver.patch}-${originalVersionSemver.prerelease[0]}`)
            {
                this._version = semver.inc(this._config.currentVersion, "prerelease", false, this.prereleaseSuffix) as string;
            }
        }
    }

    /**
     * Computes next version for build
     */
    private _computeVersion(): void
    {
        //commit and matching tag are same, always use release version
        if(this._currentTag)
        {
            this._version = this._lastMatchingVersion;

            return;
        }

        //new version for current branch, first for current major.minor number
        if(this._startingVersion)
        {
            if(this._config.pre)
            {
                this._version = `${this._lastMatchingVersion}-${this.prereleaseSuffix}.0`;
            }
            else
            {
                this._version = this._lastMatchingVersion;
            }

            return;
        }

        let version: ReleaseType = this._config.pre ? "prerelease" : "patch";
        this._version = semver.inc(this._lastMatchingVersion, version, false, this.prereleaseSuffix) as string;
    }

    /**
     * Processes branch name and extracts prefix and pure version number
     */
    private _processBranchName()
    {
        this._branchVersion = this._branchName;

        //no profix and wrong format
        if(!this._config.ignoreBranchPrefix && !/^\d+\.\d+$/g.test(this._branchName))
        {
            this._processReject(`Wrong branch name '${this._branchName}', no prefix specified and branch is not in correct format!`);

            return;
        }

        let regex = new RegExp(`^${this._config.ignoreBranchPrefix}`, 'gi');
        let matches = regex.exec(this._branchName);

        //prefix present
        if(matches)
        {
            this._branchPrefix = matches[0].replace(/\/$/g, '');
            this._branchVersion = this._branchName.replace(regex, '');
        }

        //after prefix strip still wrong format
        if(!/^\d+\.\d+$/g.test(this._branchVersion))
        {
            this._processReject(`Wrong branch name '${this._branchName}', probably wrong prefix regex, extracted version '${this._branchVersion}' is not ok!`);

            return;
        }
    }

    /**
     * Gets last matching tag
     */
    private async _getLastMatchingTag(): Promise<string>
    {
        return new Promise<string>((resolve) =>
        {
            //gets all tags
            this._git.raw([
                              "log",
                              '--pretty="%D"',
                              "--tags",
                              "--no-walk"
                          ],
                          this._errorHandle(result =>
                          {
                              result = result || '';

                              //get array of tag names
                              let tags = (result.split('\n') as string[])
                                  .filter(itm => itm)
                                  .map(itm => itm.replace(/^"|"$/g, ''))
                                  .map(itm => itm.replace(/^.*?tag:\s?(.*?)(?:$|,.*)/g, '$1'))
                                  .filter(itm => itm);

                              for(let x = 0; x < tags.length; x++)
                              {
                                  let matches = new RegExp(`^${this._config.tagPrefix}(${this._branchVersion}.*?)$`, 'gi')
                                      .exec(tags[x]);

                                  //tag and branch match
                                  if(matches)
                                  {
                                      let match = matches[1];

                                      let promises: Promise<string>[] =
                                      [
                                          new Promise<string>(resolveHash =>
                                          {
                                              this._git.raw([
                                                                "rev-list",
                                                                "-n",
                                                                "1",
                                                                tags[x]
                                                            ], 
                                                            this._errorHandle(tagResult =>
                                                            {
                                                                resolveHash(tagResult.trim());
                                                            }));
                                          }),
                                          new Promise<string>(resolveHash =>
                                          {
                                              this._git.revparse([
                                                                     "HEAD"
                                                                 ], 
                                                                 this._errorHandle(tagResult =>
                                                                 {
                                                                     resolveHash(tagResult.trim());
                                                                 }));
                                          })
                                      ];

                                      Promise.all(promises).then(value =>
                                      {
                                          if(value[0] == value[1])
                                          {
                                              this._currentTag = true;
                                          }

                                          resolve(match);
                                      });

                                      return;
                                  }
                              }

                              this._startingVersion = true;

                              resolve(`${this._branchVersion}.0`);
                          }));
        });
    }

    /**
     * Gets requested branch name
     */
    private async _getBranchName(): Promise<string>
    {
        if(this._config.branchName)
        {
            return this._config.branchName;
        }

        return new Promise<string>((resolve) =>
        {
            this._git.branch(this._errorHandle(result =>
            {
                if(result.detached)
                {
                    this._processReject("Unable to proceed if 'HEAD' is detached and no 'branchName' was specified!");

                    return;
                }

                resolve(result.current);
            }));
        });
    }

    /**
     * Creates handle function with automatic error handling
     * @param callback Callback called if result was success
     */
    private _errorHandle(callback: (result: any) => void): (error: any, result: any) => void
    {
        return (error: any, result: any) =>
        {
            if(error)
            {
                this._processReject(error);

                return;
            }

            callback(result);
        };
    }
}