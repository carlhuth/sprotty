/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ViewerOptions } from '../../base/views/viewer-options'
import { isBoundsAware } from '../bounds/model'
import { Action } from '../../base/actions/action'
import { ActionDispatcher } from '../../base/actions/action-dispatcher'
import { TYPES } from '../../base/types'
import { SModelRoot } from '../../base/model/smodel'
import { Bounds, combine, EMPTY_BOUNDS } from '../../utils/geometry'
import { ILogger } from '../../utils/logging'
import { injectable, inject } from "inversify"

export class ExportSvgAction implements Action {
    static KIND = 'exportSvg'
    kind = ExportSvgAction.KIND

    constructor(public readonly svg: string) {}
}

@injectable()
export class SvgExporter {

    constructor(@inject(TYPES.ViewerOptions) protected options: ViewerOptions,
                @inject(TYPES.IActionDispatcher) protected actionDispatcher: ActionDispatcher,
                @inject(TYPES.ILogger) protected log: ILogger) {
    }

    export(root: SModelRoot): void {
        if (typeof document !== 'undefined') {
            const div = document.getElementById(this.options.hiddenDiv)
            if (div !== null && div.firstElementChild && div.firstElementChild.tagName === 'svg') {
                const svgElement = div.firstElementChild as SVGSVGElement
                const svg = this.createSvg(svgElement, root)
                this.actionDispatcher.dispatch(new ExportSvgAction(svg))
            }
        }
    }

    protected createSvg(svgElementOrig: SVGSVGElement, root: SModelRoot): string {
        const serializer = new XMLSerializer()
        const svgCopy = serializer.serializeToString(svgElementOrig)
        const iframe = document.createElement('iframe') as HTMLIFrameElement
        document.body.appendChild(iframe)
        const docCopy = iframe.contentWindow.document
        docCopy.open()
        docCopy.write(svgCopy)
        docCopy.close()
        const svgElementNew = docCopy.getElementById(svgElementOrig.id)!
        svgElementNew.removeAttribute('opacity')
        this.copyStyles(svgElementOrig, svgElementNew, ['width', 'height', 'opacity'])
        svgElementNew.setAttribute('version', '1.1')
        const bounds = this.getBounds(root)
        svgElementNew.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`)
        const svgCode = serializer.serializeToString(svgElementNew)
        document.body.removeChild(iframe)
        return svgCode
    }

    protected copyStyles(source: Element, target: Element, skipedProperties: string[]) {
        const sourceStyle = getComputedStyle(source)
        const targetStyle = getComputedStyle(target)
        let diffStyle = ''
        for (let i = 0; i < sourceStyle.length; i++) {
            const key = sourceStyle[i]
            if (skipedProperties.indexOf(key) === -1) {
                const value = sourceStyle.getPropertyValue(key)
                if (targetStyle.getPropertyValue(key) !== value) {
                    diffStyle += key + ":" + value + ";"
                }
            }
        }
        if (diffStyle !== '')
            target.setAttribute('style', diffStyle)
        // IE doesn't retrun anything on source.children
        for (let i = 0; i < source.childNodes.length; ++i) {
            const sourceChild = source.childNodes[i]
            const targetChild = target.childNodes[i]
            if (sourceChild instanceof Element)
                this.copyStyles(sourceChild, targetChild as Element, [])
        }
    }

    protected getBounds(root: SModelRoot) {
        let allBounds: Bounds[] = [ EMPTY_BOUNDS ]
        root.children.forEach(element => {
            if (isBoundsAware(element)) {
                allBounds.push(element.bounds)
            }
        })
        return allBounds.reduce((one, two) => combine(one, two))
    }
}