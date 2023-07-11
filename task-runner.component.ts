import { Component, OnDestroy, OnInit } from '@angular/core';
import { AssetService, BaseDirective, OperationsFacade } from '@app/core';
import { Subject, timer } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { takeUntil } from 'rxjs/operators';
import { CatalogProductTaskState, FileType, IUsersTask, UsersTaskType } from '@app/model';
import { saveAs } from 'file-saver';
import { Location } from '@angular/common';
import { MessageService } from 'primeng/api';

// Should be in separate file
export enum ProgressBarState {
    IN_PROGRESS = 'active',
    SUCCESS = 'success',
    FAILED = 'exception',
}

@Component({
    selector: 'app-task-runner',
    templateUrl: './task-runner.component.html',
    styleUrls: ['./task-runner.component.scss'],
})
export class TaskRunnerComponent extends BaseDirective implements OnInit, OnDestroy {
    taskId: string;
    state = ProgressBarState.IN_PROGRESS;
    ProgressBarState = ProgressBarState;
    task: IUsersTask;
    type = UsersTaskType.CATALOG;
    fileType: FileType;
    //
    progressTimerSub$ = new Subject();

    constructor(
        private operationsFacade: OperationsFacade,
        private assetService: AssetService,
        private messageService: MessageService,
        private activatedRoute: ActivatedRoute,
        private _location: Location,
    ) {
        super();

        this.activatedRoute.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
            if (params?.taskId) this.taskId = params.taskId;
            if (params?.type) this.type = params.type;
            if (params?.fileType) this.fileType = params.fileType;
        });
    }

    ngOnInit(): void {
        this.startTasksProgressTimer();
    }

    private startTasksProgressTimer(): void {
        timer(0, 2000)
            .pipe(takeUntil(this.progressTimerSub$))
            .subscribe(res => {
                this.state = ProgressBarState.IN_PROGRESS;
                this.operationsFacade.fetchUsersTask(this.type, this.taskId, data => {
                    if (data?.state === CatalogProductTaskState.DONE) {
                        this.state = ProgressBarState.SUCCESS;
                        this.finishTasksProgressTimer(data);
                    }
                    if (data?.state === CatalogProductTaskState.FAILED) {
                        this.state = ProgressBarState.FAILED;
                        this.finishTasksProgressTimer(data);
                    }
                });
            });
    }

    private finishTasksProgressTimer(task?: IUsersTask): void {
        this.task = task;
        this.progressTimerSub$.next();
    }

    downloadDocument(url: string): void {
        if (this.type === UsersTaskType.PAYMENTS) {
            this.assetService.getTaskDocument(UsersTaskType.WALLET, this.taskId).subscribe(response => {
                this.saveFile(response);
            });
            return;
        }
        if (this.type === UsersTaskType.STORES) {
            this.assetService.getTaskDocument(UsersTaskType.STORES, this.taskId).subscribe(response => {
                this.saveFile(response);
            });
            return;
        }
        this.assetService
            .getDocument(url)
            .pipe(takeUntil(this.destroy$))
            .subscribe(
                response => {
                    this.saveFile(response);
                },
                error => {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'File is not able to download.',
                    });
                    console.error(error);
                },
            );
    }

    private saveFile(response): void {
        let contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        if (this.fileType === FileType.CSV) contentType = 'text/csv';
        if (this.fileType === FileType.ZIP) contentType = 'application/zip';

        const blob = new Blob([response], {
            type: contentType,
        });
        const saveType = this.setFileType();

        saveAs(blob, this.type + '.' + saveType);
    }

    setFileType(): FileType {
        switch (this.fileType) {
            case FileType.CSV:
                return FileType.CSV;
            case FileType.ZIP:
                return FileType.ZIP;
            case FileType.XLS:
                return FileType.XLS;
            default:
                return FileType.XLSX;
        }
    }

    navigateBack(): void {
        this._location.back();
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();

        this.finishTasksProgressTimer();
    }
}
