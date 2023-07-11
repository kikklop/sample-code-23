import { inject, Inject, Injectable } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";
import { BehaviorSubject, first, from, Observable, switchMap } from "rxjs";
import { read, utils, WorkBook, WorkSheet } from "xlsx";

import { EnvironmentConfig, portalEnvironmentToken } from "@app/portal/data-access/common";
import { getPaymentMethodListWhenLoaded } from "@app/portal/data-access/payment-method";
import { MissionCreationQuestLocationType } from "@app/portal/types/branch";
import {
    MissionImportMetadata,
    MissionImportProperties,
    MissionImportType,
    MissionRequestGridEntity,
    QuestTimeWindow,
} from "@app/portal/types/mission";
import { PaymentMethodResponse } from "@app/portal/types/payment-method";
import { constructDateTime, errorTimeOut } from "@app/portal/util/helpers";
import { Store } from "@ngrx/store";
import { DateTime } from "luxon";
import { ToastrService } from "ngx-toastr";
import { MissionImportValidationService } from "./mission-import-validation.service";

@Injectable({ providedIn: "root" })
export class MissionImportService {
    private readonly store: Store = inject(Store);
    private _metadata: MissionImportMetadata = {
        uploadedFile: undefined,
        invalidInputProperties: new Map<number, MissionImportProperties[]>(),
        areInputsValid: false,
        workbook: undefined,
        workbookIsValid: new BehaviorSubject<boolean>(false),
    };
    private _dropRequestedTimeWindow?: QuestTimeWindow;
    private _pickupRequestedTimeWindow?: QuestTimeWindow;
    private _limit: number = 100;
    public partnerId?: number;
    public branchId?: number;
    public requestedDate?: DateTime;
    public timeWindowsPresent: boolean = false;
    public dropLocationType?: MissionCreationQuestLocationType;
    public pickupLocationType?: MissionCreationQuestLocationType;

    constructor(
        private readonly validationService: MissionImportValidationService,
        private readonly translateService: TranslateService,
        private readonly toaster: ToastrService,
        @Inject(portalEnvironmentToken)
        public environment: EnvironmentConfig,
    ) {}

    public get metadata(): MissionImportMetadata {
        return this._metadata;
    }

    public get limit(): number {
        return this._limit;
    }

    public set limit(limit: number) {
        this._limit = limit;
    }

    public get isDynamicImport(): boolean {
        return this.timeWindowsPresent;
    }

    public get uploadedFile(): HTMLInputElement | undefined {
        return this._metadata.uploadedFile;
    }

    public set uploadedFile(uploadedFile: HTMLInputElement | undefined) {
        this._metadata.uploadedFile = uploadedFile;
        this.setWorkbook();
    }

    public get workbook(): WorkBook | undefined {
        return this._metadata.workbook;
    }

    public get isFileUploaded(): boolean {
        return !!this._metadata.uploadedFile;
    }

    public get areInputsValid(): boolean {
        return this._metadata.areInputsValid;
    }

    private set areInputsValid(valid: boolean) {
        this._metadata.areInputsValid = valid;
    }

    public get dropRequestedTimeWindow(): QuestTimeWindow | undefined {
        return this._dropRequestedTimeWindow;
    }

    public set dropRequestedTimeWindow(value: QuestTimeWindow | undefined) {
        this._dropRequestedTimeWindow = value;
    }

    public get pickupRequestedTimeWindow(): QuestTimeWindow | undefined {
        return this._pickupRequestedTimeWindow;
    }

    public set pickupRequestedTimeWindow(value: QuestTimeWindow | undefined) {
        this._pickupRequestedTimeWindow = value;
    }

    public forgetUploadedFile(): void {
        this.uploadedFile = undefined;
    }

    public clear(): void {
        this.forgetUploadedFile();
        this.areInputsValid = false;
        this.metadata.invalidInputProperties.clear();
        this.metadata.workbookIsValid?.next(false);
    }

    /**
     * Parses file and returns Observable with prepared MissionRequest objects.
     */
    public startParsing(): Observable<MissionRequestGridEntity[]> {
        if (!this.partnerId || !this.branchId) {
            throw new Error("PartnerId or BranchId is not defined");
        }

        if (!this.workbook) {
            throw new Error("Workbook is not defined");
        }

        if (
            this.isDynamicImport &&
            (!this.requestedDate || !this.pickupRequestedTimeWindow || !this.dropRequestedTimeWindow)
        ) {
            throw new Error("Requested date or time window is not defined for dynamic import");
        }

        return this.store.pipe(
            getPaymentMethodListWhenLoaded,
            first(),
            switchMap(
                (paymentMethods) =>
                    new Observable<MissionRequestGridEntity[]>((subscriber) => {
                        const jsonFromSheet = this.getJsonFromWorksheet(this.workbook!);
                        const missionRequests = this.constructMissionRequestsFromJson(paymentMethods, jsonFromSheet);

                        if (missionRequests.length > this.limit) {
                            throw new Error(
                                this.translateService.instant("orders.import.alert.limit", {
                                    limit: this.limit,
                                }),
                            );
                        }

                        subscriber.next(missionRequests);
                        subscriber.complete();
                    }),
            ),
            switchMap((missionRequests) => from(this.validateMissions(missionRequests))),
        );
    }

    /**
     * Read workbook from uploaded file and validate it.
     */
    private setWorkbook(): void {
        if (!this.uploadedFile) {
            return;
        }

        if (this.uploadedFile.files?.length !== 1) {
            throw new Error("Cannot use multiple files");
        }

        const reader: FileReader = new FileReader();
        reader.onload = async (event: ProgressEvent<FileReader>) => {
            try {
                this._metadata.workbook = this.parseWorkbookFromFile(event);
                const isValid: boolean = this.checkWorkbookVersion(this._metadata.workbook);
                this._metadata.workbookIsValid?.next(isValid);
                if (!isValid) {
                    this.toaster.error(this.translateService.instant("orders.import.alert.invalidFileVersion"), undefined, {
                        timeOut: errorTimeOut,
                    });
                }
            } catch (error) {
                console.error(`Problem occurred while parsing '${event.target?.result}' file.`, error);
                this.forgetUploadedFile();
                throw error;
            }
        };

        reader.readAsArrayBuffer(this.uploadedFile.files.item(0) as Blob);
    }

    /**
     * Parses workbook from file.
     */
    private parseWorkbookFromFile(event: ProgressEvent<FileReader>): WorkBook {
        const arrayBuffer: ArrayBuffer = event.target?.result as ArrayBuffer;
        return read(arrayBuffer);
    }

    /**
     * Checks if workbook is in correct version by accessing Comments property of Excel metadata.
     * At the moment we are accepting workbooks without version and with version 0.0.1 due to the smooth transition to the strict workbook versioning.
     */
    private checkWorkbookVersion(workbook: WorkBook): boolean {
        return (
            !workbook.Props?.Comments ||
            workbook.Props.Comments ===
            this.environment[this.isDynamicImport ? "dynamicMissionImport" : "missionImport"].fileVersion
        );
    }

    /**
     * Creates two-dimensional array from worksheet.
     * @param workbook Excel workbook.
     * @param sheetNumber Number of sheet to grab.
     */
    private getJsonFromWorksheet(workbook: WorkBook, sheetNumber: number = 0): MissionImportType[][] {
        // Grab selected sheet
        const sheetName: string = workbook.SheetNames[sheetNumber];
        const worksheet: WorkSheet = workbook.Sheets[sheetName];

        // Create two-dimensional array from worksheet
        return utils.sheet_to_json(worksheet, {
            blankrows: false,
            defval: undefined,
            header: 1,
        }) as MissionImportType[][];
    }

    /**
     * Takes worksheet as two-dimensional array and constructs array of MissionRequest from it.
     * @param paymentMethods
     * @param jsonFromSheet Worksheet as two-dimensional array.
     */
    private constructMissionRequestsFromJson(
        paymentMethods: PaymentMethodResponse[],
        jsonFromSheet: MissionImportType[][],
    ): MissionRequestGridEntity[] {
        const missionRequests: MissionRequestGridEntity[] = [];

        for (let i = 2; i < jsonFromSheet.length; i++) {
            const row = jsonFromSheet[i];
            if (row.length > 1) {
                if (this.isDynamicImport) {
                    missionRequests.push(this.createDynamicMissionRequest(row, paymentMethods));
                } else {
                    missionRequests.push(this.createMissionRequest(row, paymentMethods));
                }
            }
        }

        return missionRequests;
    }

    /**
     * Creates MissionRequest objects from parsed excel row.
     */
    private createMissionRequest(
        row: MissionImportType[],
        paymentMethods: PaymentMethodResponse[],
    ): MissionRequestGridEntity {
        return {
            identifier: row[1] ? `${row[1]}` : undefined,
            customerName: row[2] ? `${row[2]}` : undefined,
            customerPhone: row[3] ? `${row[3]}` : undefined,
            customerEmail: row[4] ? `${row[4]}` : undefined,
            partnerId: this.partnerId,
            price: row[5] !== null && row[5] !== undefined ? +row[5] : undefined,
            paymentMethodId: row[6]
                ? paymentMethods.find((paymentMethod) => paymentMethod.identifier === row[6])?.id
                : undefined,
            variableSymbol: row[7] ? `${row[7]}` : undefined,
            pickup: {
                branchId: this.pickupLocationType === MissionCreationQuestLocationType.Branch ? this.branchId : undefined,
                locationType: this.pickupLocationType,
                requestedDate: row[8] ? constructDateTime(`${row[8]}`) : undefined,
                requestedTimeWindow: {
                    start: row[8] ? constructDateTime(`${row[8]}`) : undefined,
                    end: row[9] ? constructDateTime(`${row[9]}`) : undefined,
                },
                note: row[10] ? `${row[10]}` : undefined,
            },
            drop: {
                branchId: this.dropLocationType === MissionCreationQuestLocationType.Branch ? this.branchId : undefined,
                locationType: this.dropLocationType,
                addressRawValue: row[11] ? `${row[11]}` : undefined,
                requestedDate: row[12] ? constructDateTime(`${row[12]}`) : undefined,
                requestedTimeWindow: {
                    start: row[12] ? constructDateTime(`${row[12]}`) : undefined,
                    end: row[13] ? constructDateTime(`${row[13]}`) : undefined,
                },
                note: row[14] ? `${row[14]}` : undefined,
                contactName: row[15] ? `${row[15]}` : undefined,
                floorNumber: row[16] ? `${row[16]}` : undefined,
                companyName: row[17] ? `${row[17]}` : undefined,
                companyRegistrationNumber: row[18] ? `${row[18]}` : undefined,
            },
            status: "check-circle-medium|status-icon--success",
        };
    }

    /**
     * Creates MissionRequest objects from parsed excel row and add predefined Time slots.
     */
    private createDynamicMissionRequest(
        row: MissionImportType[],
        paymentMethods: PaymentMethodResponse[],
    ): MissionRequestGridEntity {
        return {
            identifier: row[1] ? `${row[1]}` : undefined,
            customerName: row[2] ? `${row[2]}` : undefined,
            customerPhone: row[3] ? `${row[3]}` : undefined,
            customerEmail: row[4] ? `${row[4]}` : undefined,
            partnerId: this.partnerId,
            price: row[5] !== null && row[5] !== undefined ? +row[5] : undefined,
            paymentMethodId: row[6]
                ? paymentMethods.find((paymentMethod) => paymentMethod.identifier === row[6])?.id
                : undefined,
            variableSymbol: row[7] ? `${row[7]}` : undefined,
            pickup: {
                locationType: this.pickupLocationType,
                requestedDate: this.requestedDate,
                requestedTimeWindow: {
                    start: this.formatTimeWindowDate(this.requestedDate!, <DateTime>this.pickupRequestedTimeWindow?.start),
                    end: this.formatTimeWindowDate(this.requestedDate!, <DateTime>this.pickupRequestedTimeWindow?.end),
                },
                note: row[8] ? `${row[8]}` : undefined,
                branchId: this.pickupLocationType === MissionCreationQuestLocationType.Branch ? this.branchId : undefined,
            },
            drop: {
                branchId: this.dropLocationType === MissionCreationQuestLocationType.Branch ? this.branchId : undefined,
                addressRawValue: row[9] ? `${row[9]}` : undefined,
                locationType: this.dropLocationType,
                requestedDate: this.requestedDate,
                requestedTimeWindow: {
                    start: this.formatTimeWindowDate(this.requestedDate!, <DateTime>this.dropRequestedTimeWindow?.start),
                    end: this.formatTimeWindowDate(this.requestedDate!, <DateTime>this.dropRequestedTimeWindow?.end),
                },
                note: row[10] ? `${row[10]}` : undefined,
                contactName: row[11] ? `${row[11]}` : undefined,
                floorNumber: row[12] ? `${row[12]}` : undefined,
                companyName: row[13] ? `${row[13]}` : undefined,
                companyRegistrationNumber: row[14] ? `${row[14]}` : undefined,
            },
            status: "check-circle-medium|status-icon--success",
        };
    }

    /**
     * Runs validation functions.
     * @param missionRequests Parsed and constructed from file MissionRequest objects.
     */
    private async validateMissions(missionRequests: MissionRequestGridEntity[]): Promise<MissionRequestGridEntity[]> {
        const copyOfMissionRequests = [...missionRequests];

        if (this.isDynamicImport) {
            this.validationService.validationPropertiesToSkip = [
                MissionImportProperties.PickupRequestedStart,
                MissionImportProperties.PickupRequestedEnd,
                MissionImportProperties.DropRequestedStart,
                MissionImportProperties.DropRequestedEnd,
                MissionImportProperties.CustomerEmail,
                MissionImportProperties.Identifier,
                MissionImportProperties.VariableSymbol,
            ];
        } else {
            this.validationService.validationPropertiesToSkip = [
                MissionImportProperties.CustomerEmail,
                MissionImportProperties.Identifier,
                MissionImportProperties.VariableSymbol,
            ];
        }

        this.metadata.invalidInputProperties = await this.validationService.validateMissions(
            this.partnerId,
            copyOfMissionRequests,
        );
        this.areInputsValid = !this.metadata.invalidInputProperties.size;
        if (!this.areInputsValid) {
            for (let i = 0; i < copyOfMissionRequests.length; i++) {
                if (this.metadata.invalidInputProperties.has(i)) {
                    copyOfMissionRequests[i].status = "cross-medium|status-icon--error";
                }
            }
        }

        return copyOfMissionRequests;
    }

    /**
     * Create correct DateTime from Requested date and TimeWindow date.
     */
    private formatTimeWindowDate(requestedDate: DateTime, timeWindowDate: DateTime): DateTime {
        const hour = timeWindowDate.get("hour");
        const minute = timeWindowDate.get("minute");
        return requestedDate.set({ hour: hour, minute: minute });
    }
}
