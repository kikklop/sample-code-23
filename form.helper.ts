import { Injectable, Injector } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { FeedMarginCalculationType, IFeedConfig, IFeedTask } from '@app/model';
import { MaskPercentUtil } from '@app/core';

@Injectable()
export class ImportFeederFormHelper {
    fb: FormBuilder;

    constructor(injector: Injector) {
        this.fb = injector.get(FormBuilder);
    }

    createImportFeedConfigForm(importFeedConfig?: IFeedConfig): FormGroup {
        const form = this.fb.group({
            importSourceType: [importFeedConfig?.importSourceType],
            whitelistEnabled: [importFeedConfig?.userFeedConfig?.whitelistEnabled],
            whiteListedSkus: this.fb.array([]),
            blacklistEnabled: [importFeedConfig?.userFeedConfig?.blacklistEnabled],
            blackListedSkus: this.fb.array([]),
            autoPublishing: [importFeedConfig?.userFeedConfig?.autoPublishing],
            whitelistedAutoPublishSkus: this.fb.array([]),
            blacklistedAutoPublishSkus: this.fb.array([]),
            importPriceType: [importFeedConfig?.userFeedConfig?.importPriceType],
            purchasePriceCalculation: this.fb.group({
                margin: [
                    importFeedConfig?.userFeedConfig?.purchasePriceCalculation?.margin >= 0
                        ? MaskPercentUtil.maskPercent(importFeedConfig?.userFeedConfig?.purchasePriceCalculation?.margin)
                        : null,
                ],
                type: [
                    importFeedConfig?.userFeedConfig?.purchasePriceCalculation?.type
                        ? importFeedConfig?.userFeedConfig?.purchasePriceCalculation?.type
                        : FeedMarginCalculationType.BASIC,
                ],
            }),
            basePriceCalculation: this.fb.group({
                margin: [
                    importFeedConfig?.userFeedConfig?.basePriceCalculation?.margin >= 0
                        ? MaskPercentUtil.maskPercent(importFeedConfig?.userFeedConfig?.basePriceCalculation?.margin)
                        : null,
                ],
                type: [
                    importFeedConfig?.userFeedConfig?.basePriceCalculation?.type
                        ? importFeedConfig?.userFeedConfig?.basePriceCalculation?.type
                        : FeedMarginCalculationType.BASIC,
                ],
            }),
            addVatToPurchasePrice: [
                importFeedConfig?.userFeedConfig?.addVatToPurchasePrice
                ?? false,
            ],
            addVatToBasePrice: [
                importFeedConfig?.userFeedConfig?.addVatToBasePrice
                ?? false,
            ],
            vatRate: [importFeedConfig?.userFeedConfig?.vatRate],
            importedProductType: [importFeedConfig?.userFeedConfig?.importedProductType],
            useETagForImages: [importFeedConfig?.userFeedConfig?.useETagForImages ?? false],
            imageCacheEnabled: [importFeedConfig?.userFeedConfig?.imageCacheEnabled ?? false],
        });

        if (importFeedConfig?.userFeedConfig?.whitelistedSkus?.length) {
            for (const sku of importFeedConfig?.userFeedConfig?.whitelistedSkus || []) {
                (form.get('whiteListedSkus') as FormArray)?.push(this.createListItem(sku));
            }
        }

        if (importFeedConfig?.userFeedConfig?.blacklistedSkus?.length) {
            for (const sku of importFeedConfig?.userFeedConfig?.blacklistedSkus || []) {
                (form.get('blacklistedSkus') as FormArray)?.push(this.createListItem(sku));
            }
        }

        if (importFeedConfig?.userFeedConfig?.whitelistedAutoPublishSkus?.length) {
            for (const sku of importFeedConfig?.userFeedConfig?.whitelistedAutoPublishSkus || []) {
                (form.get('whitelistedAutoPublishSkus') as FormArray)?.push(this.createListItem(sku));
            }
        }

        if (importFeedConfig?.userFeedConfig?.blacklistedAutoPublishSkus?.length) {
            for (const sku of importFeedConfig?.userFeedConfig?.blacklistedAutoPublishSkus || []) {
                (form.get('blacklistedAutoPublishSkus') as FormArray)?.push(this.createListItem(sku));
            }
        }
        return form;
    }

    createListItem(sku?): FormGroup {
        return new FormGroup({
            skuName: new FormControl(sku ?? null),
        });
    }

    createTaskConfigForm(taskConfig?: IFeedTask): FormGroup {
        const form = this.fb.group({
            whitelistEnabled: [taskConfig?.userFeedConfig?.whitelistEnabled],
            whiteListedSkus: this.fb.array([]),
            blacklistEnabled: [taskConfig?.userFeedConfig?.blacklistEnabled],
            blackListedSkus: this.fb.array([]),
            autoPublishing: [taskConfig?.userFeedConfig?.autoPublishing],
            whitelistedAutoPublishSkus: this.fb.array([]),
            blacklistedAutoPublishSkus: this.fb.array([]),
            importPriceType: [taskConfig?.userFeedConfig?.importPriceType],
            purchasePriceCalculation: this.fb.group({
                margin: [taskConfig?.userFeedConfig?.purchasePriceCalculation?.margin],
                type: [
                    taskConfig?.userFeedConfig?.purchasePriceCalculation?.type ?? FeedMarginCalculationType.BASIC,
                ],
            }),
            basePriceCalculation: this.fb.group({
                margin: [taskConfig?.userFeedConfig?.basePriceCalculation?.margin],
                type: [
                    taskConfig?.userFeedConfig?.basePriceCalculation?.type ?? FeedMarginCalculationType.BASIC,
                ],
            }),
            addVatToPurchasePrice: [
                taskConfig?.userFeedConfig?.addVatToPurchasePrice ?? false,
            ],
            addVatToBasePrice: [
                taskConfig?.userFeedConfig?.addVatToBasePrice ?? false,
            ],
            vatRate: [taskConfig?.userFeedConfig?.vatRate],
            importedProductType: [taskConfig?.userFeedConfig?.importedProductType],
            useETagForImages: [taskConfig?.userFeedConfig?.useETagForImages ?? false],
            imageCacheEnabled: [taskConfig?.userFeedConfig?.imageCacheEnabled ?? false],
        });

        if (taskConfig?.userFeedConfig?.whitelistedSkus?.length) {
            for (const sku of taskConfig?.userFeedConfig?.whitelistedSkus || []) {
                (form.get('whiteListedSkus') as FormArray)?.push(this.createListItem(sku));
            }
        }

        if (taskConfig?.userFeedConfig?.blacklistedSkus?.length) {
            for (const sku of taskConfig?.userFeedConfig?.blacklistedSkus || []) {
                (form.get('blacklistedSkus') as FormArray)?.push(this.createListItem(sku));
            }
        }

        if (taskConfig?.userFeedConfig?.whitelistedAutoPublishSkus?.length) {
            for (const sku of taskConfig?.userFeedConfig?.whitelistedAutoPublishSkus || []) {
                (form.get('whitelistedAutoPublishSkus') as FormArray)?.push(this.createListItem(sku));
            }
        }

        if (taskConfig?.userFeedConfig?.blacklistedAutoPublishSkus?.length) {
            for (const sku of taskConfig?.userFeedConfig?.blacklistedAutoPublishSkus || []) {
                (form.get('blacklistedAutoPublishSkus') as FormArray)?.push(this.createListItem(sku));
            }
        }

        return form;
    }
}
