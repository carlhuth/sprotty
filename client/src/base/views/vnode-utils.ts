/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { VNode } from "snabbdom/vnode"
import { SModelElement } from "../model/smodel"

export function setAttr(vnode: VNode, name: string, value: any) {
    getAttrs(vnode)[name] = value
}

export function setClass(vnode: VNode, name: string, value: boolean) {
    getClass(vnode)[name] = value
}

export function copyClassesFromVNode(source: VNode, target: VNode) {
    const classList = getClass(source)
    for (const c in classList) {
        setClass(target, c, true)
    }
}

export function copyClassesFromElement(element: HTMLElement, target: VNode) {
    const classList = element.classList
    for (let i = 0; i < classList.length; i++) {
        setClass(target, classList.item(i), true)
    }
}

export function mergeStyle(vnode: VNode, style: any) {
    getData(vnode).style = {...(getData(vnode).style || {}), ...style}
}

export function on(vnode: VNode, event: string, listener: (model: SModelElement, event: Event) => void, element: SModelElement) {
    const on = getOn(vnode)
    if (on[event]) {
        throw new Error('EventListener for ' + event + ' already registered on VNode')
    }
    (on as any)[event] = [listener, element]
}

export function getAttrs(vnode: VNode) {
    const data = getData(vnode)
    if (!data.attrs)
        data.attrs = {}
    return data.attrs
}

function getData(vnode: VNode) {
    if (!vnode.data)
        vnode.data = {}
    return vnode.data
}

function getClass(vnode: VNode) {
    const data = getData(vnode)
    if (!data.class)
        data.class = {}
    return data.class
}

function getOn(vnode: VNode) {
    const data = getData(vnode)
    if (!data.on)
        data.on = {}
    return data.on
}
