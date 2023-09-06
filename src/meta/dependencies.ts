import path from 'path';
import fs from 'fs';

import semver from 'semver';
import winston from 'winston';
import chalk from 'chalk';

import pkg from '../../package.json';
import { paths, pluginNamePattern } from '../constants';

// The next line calls a function in a module that has not been updated to TS yet
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
const Dependencies = module.exports;

let depsMissing = false;
let depsOutdated = false;

Dependencies.check = async function () : Promise<void> {
    const modules : string[] = Object.keys(pkg.dependencies);

    winston.verbose('Checking dependencies for outdated modules');

    await Promise.all(modules.map(module => Dependencies.checkModule(module)));

    if (depsMissing) {
        throw new Error('dependencies-missing');
    } else if (depsOutdated && global.env !== 'development') {
        throw new Error('dependencies-out-of-date');
    }
};

Dependencies.checkModule = async function (moduleName: string): Promise<boolean> {
    try {
        let pkgData = await fs.promises.readFile(path.join(paths.nodeModules, moduleName, 'package.json'), 'utf8');
        pkgData = Dependencies.parseModuleData(moduleName, pkgData) as string;

        const satisfies: boolean = Dependencies.doesSatisfy(pkgData, pkg.dependencies[moduleName]);
        return satisfies;
    } catch (err) {
        if (err.code === 'ENOENT' && pluginNamePattern.test(moduleName)) {
            winston.warn(`[meta/dependencies] Bundled plugin ${moduleName} not found, skipping dependency check.`);
            return true;
        }
        throw err;
    }
};

Dependencies.parseModuleData = function (moduleName: string, pkgData: string): string {
    try {
        pkgData = JSON.parse(pkgData);
    } catch (e) {
        winston.warn(`[${chalk.red('missing')}] ${chalk.bold(moduleName)} is a required dependency but could not be found\n`);
        depsMissing = true;
        return null;
    }
    return pkgData;
};

Dependencies.doesSatisfy = function (moduleData, packageJSONVersion: string): boolean {
    if (!moduleData) {
        return false;
    }
    const versionOk: boolean = !semver.validRange(packageJSONVersion) ||
        semver.satisfies(moduleData.version, packageJSONVersion);
    const githubRepo: boolean = (moduleData._resolved && moduleData._resolved.includes('//github.com')) as boolean;
    const satisfies: boolean = versionOk || githubRepo;
    if (!satisfies) {
        winston.warn(`[${chalk.yellow('outdated')}] ${chalk.bold(moduleData.name)} installed v${moduleData.version}, package.json requires ${packageJSONVersion}\n`);
        depsOutdated = true;
    }
    return satisfies;
};
