import { FeatureFile } from './cucumber/FeatureFile';
import { ADB } from './utils/ADB';
import { AndroidDevice } from './devices/AndroidDevice';
import { WebDevice } from './devices/WebDevice';
import { Device } from './devices/Device';
import { exec, execSync } from "child_process";
import { AndroidProcess } from './processes/AndroidProcess';
import { WebProcess } from './processes/WebProcess';
import { DeviceProcess } from './processes/DeviceProcess';
import * as Constants from './utils/Constants';
import { FileHelper } from './utils/FileHelper';
import { Reporter } from './reports/Reporter';
import { KrakenMobile } from './KrakenMobile';
const { randomBytes } = require('crypto');

export class TestScenario {
  featureFile: FeatureFile;
  reporter: Reporter;
  processes: DeviceProcess[];
  krakenApp: KrakenMobile;
  executionId: string;
  devices: Device[];

  constructor(featureFile: FeatureFile, krakenApp: KrakenMobile) { 
    this.featureFile = featureFile;
    this.krakenApp = krakenApp;
    this.reporter = new Reporter(this);
    this.processes = [];
    this.executionId = randomBytes(10).toString('hex');
    this.devices = [];
  }

  public async run() {

    if (!this.featureFile.hasRightSyntax()) {
      throw new Error(
        `ERROR: Verify feature file ${this.featureFile.filePath} has one unique @user tag for each scenario`
        );
    }

    this.beforeExecute();
    this.execute();
    await this.allProcessesFinished();
    this.afterExecute();
  }

  private beforeExecute() {
    this.deleteSupportFilesAndDirectories();

    this.devices = this.sampleDevices();
    var interval = 1000;
    this.devices.forEach((device: WebDevice, index: number) => {
      if (!device) { return; }

      let process = new WebProcess(index + 1, device, this); 
      process.registerProcessToDirectory();
      this.processes.push(process);
    });
    this.reporter.createReportFolderRequirements();
  }

  private execute() {
    this.processes.forEach((process) => {
      process.run();
      this.pause(2000)
    });
  }

  private afterExecute() {
    this.deleteSupportFilesAndDirectories();
    this.notifyScenarioFinished();
    this.reporter.saveReport();
  }

  private notifyScenarioFinished() {
    this.krakenApp.onTestScenarioFinished();
  }

  private deleteSupportFilesAndDirectories() {

    FileHelper.instance().deleteFileInPathIfExists(Constants.DIRECTORY_PATH);
    FileHelper.instance().deleteFileInPathIfExists(Constants.DICTIONARY_PATH);
    for (let state in Constants.PROCESS_STATE_FILE_PATH) {
      FileHelper.instance().deleteFileInPathIfExists(Constants.PROCESS_STATE_FILE_PATH[`${state}`]);
    }

    FileHelper.instance().deleteKrakenDirectory(Constants.KRAKEN_DIRECTORY);
  }

  sampleDevices(): Device[] {
    
    // Crea un WebDevice por cada escenario en el feature file
    const numberOfScenarios = this.featureFile.scenarios.length;


    let webDevices: WebDevice[] = [];
    for (let i = 0; i < numberOfScenarios; i++) {
      webDevices.push(WebDevice.factoryCreate());
    }
    return webDevices;
  }

  private allRegiresteredDevicesFinished(): Boolean {
    let registered_ids = DeviceProcess.registeredProcessIds();    
    let finished_ids = DeviceProcess.processesInState(Constants.PROCESS_STATES.finished);
    return registered_ids.filter((registered_id) => {
      return !finished_ids.includes(registered_id);
    }).length <= 0;
  }

  private async allProcessesFinished() {
    return new Promise(resolve => this.waitForAllProcessesToFinishOrTimeout(Date.now(), resolve));
  }

  private waitForAllProcessesToFinishOrTimeout(startTime: any, resolve: any) {
    if (this.allRegiresteredDevicesFinished()) {
      resolve();
    } else if (
      (Date.now() - startTime) >= Constants.DEFAULT_PROCESS_TIMEOUT_SECONDS
    ) {
      throw new Error(`ERROR: Timeout, a process took more time than expected.`);
    } else {
      setTimeout(
        this.waitForAllProcessesToFinishOrTimeout.bind(this, startTime, resolve), 1000
      );
    }
  }

  private pause(milliseconds: number) {
    var dt: any = new Date();
    while ((new Date() as any) - dt <= milliseconds) {}
  }
}
