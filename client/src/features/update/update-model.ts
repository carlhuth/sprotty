/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify"
import { isValidDimension, almostEquals } from "../../utils/geometry"
import { Animation, CompoundAnimation } from '../../base/animations/animation'
import { Command, CommandExecutionContext, CommandResult } from '../../base/commands/command'
import { FadeAnimation, ResolvedElementFade } from '../fade/fade'
import { Action } from '../../base/actions/action'
import { SModelRootSchema, SModelRoot, SChildElement, SModelElement, SParentElement } from "../../base/model/smodel"
import { MoveAnimation, ResolvedElementMove } from "../move/move"
import { Fadeable, isFadeable } from "../fade/model"
import { isLocateable } from "../move/model"
import { isBoundsAware } from "../bounds/model"
import { ViewportRootElement } from "../viewport/viewport-root"
import { isSelectable } from "../select/model"
import { MatchResult, ModelMatcher, Match } from "./model-matching"
import { ResolvedElementResize, ResizeAnimation } from '../bounds/resize'

/**
 * Sent from the model source to the client in order to update the model. If no model is present yet,
 * this behaves the same as a SetModelAction. The transition from the old model to the new one can be animated.
 */
export class UpdateModelAction implements Action {
    readonly kind = UpdateModelCommand.KIND
    matches?: Match[]
    animate?: boolean = true

    constructor(public readonly newRoot?: SModelRootSchema) {
    }
}

export interface UpdateAnimationData {
    fades: ResolvedElementFade[]
    moves?: ResolvedElementMove[]
    resizes?: ResolvedElementResize[]
}

@injectable()
export class UpdateModelCommand extends Command {
    static readonly KIND = 'updateModel'

    oldRoot: SModelRoot
    newRoot: SModelRoot

    constructor(public action: UpdateModelAction) {
        super()
        if (action.animate === undefined)
            action.animate = true
    }

    execute(context: CommandExecutionContext): CommandResult {
        let newRoot: SModelRoot
        if (this.action.newRoot !== undefined) {
            newRoot = context.modelFactory.createRoot(this.action.newRoot)
        } else {
            newRoot = context.modelFactory.createRoot(context.root)
            if (this.action.matches !== undefined)
                this.applyMatches(newRoot, this.action.matches, context)
        }
        this.oldRoot = context.root
        this.newRoot = newRoot
        return this.performUpdate(this.oldRoot, this.newRoot, context)
    }

    protected performUpdate(oldRoot: SModelRoot, newRoot: SModelRoot, context: CommandExecutionContext): CommandResult {
        if (this.action.animate && oldRoot.id === newRoot.id) {
            let matchResult: MatchResult
            if (this.action.matches === undefined) {
                const matcher = new ModelMatcher()
                matchResult = matcher.match(oldRoot, newRoot)
            } else {
                matchResult = this.convertToMatchResult(this.action.matches, oldRoot, newRoot)
            }
            const animationOrRoot = this.computeAnimation(newRoot, matchResult, context)
            if (animationOrRoot instanceof Animation)
                return animationOrRoot.start()
            else
                return animationOrRoot
        } else {
            newRoot.canvasBounds = oldRoot.canvasBounds
            return newRoot
        }
    }

    protected applyMatches(root: SModelRoot, matches: Match[], context: CommandExecutionContext): void {
        const index = root.index
        for (const match of matches) {
            if (match.left !== undefined) {
                const element = index.getById(match.left.id)
                if (element instanceof SChildElement)
                    element.parent.remove(element)
            }
            if (match.right !== undefined) {
                const element = context.modelFactory.createElement(match.right)
                let parent: SModelElement | undefined
                if (match.rightParentId !== undefined)
                    parent = index.getById(match.rightParentId)
                if (parent instanceof SParentElement)
                    parent.add(element)
                else
                    root.add(element)
            }
        }
    }

    protected convertToMatchResult(matches: Match[], leftRoot: SModelRoot, rightRoot: SModelRoot): MatchResult {
        const result: MatchResult = {}
        for (const match of matches) {
            const converted: Match = {}
            let id: string | undefined = undefined
            if (match.left !== undefined) {
                id = match.left.id
                converted.left = leftRoot.index.getById(id)
                converted.leftParentId = match.leftParentId
            }
            if (match.right !== undefined) {
                id = match.right.id
                converted.right = rightRoot.index.getById(id)
                converted.rightParentId = match.rightParentId
            }
            if (id !== undefined)
                result[id] = converted
        }
        return result
    }

    protected computeAnimation(newRoot: SModelRoot, matchResult: MatchResult, context: CommandExecutionContext): SModelRoot | Animation {
        const animationData: UpdateAnimationData = {
            fades: [] as ResolvedElementFade[]
        }
        for (const id in matchResult) {
            const match = matchResult[id]
            if (match.left !== undefined && match.right !== undefined) {
                // The element is still there, but may have been moved
                this.updateElement(match.left as SModelElement, match.right as SModelElement, animationData)
            } else if (match.right !== undefined) {
                // An element has been added
                const right = match.right as SModelElement
                if (isFadeable(right)) {
                    right.opacity = 0
                    animationData.fades.push({
                        element: right,
                        type: 'in'
                    })
                }
            } else if (match.left instanceof SChildElement) {
                // An element has been removed
                const left = match.left
                if (isFadeable(left) && match.leftParentId !== undefined) {
                    if (newRoot.index.getById(left.id) === undefined) {
                        const parent = newRoot.index.getById(match.leftParentId)
                        if (parent instanceof SParentElement) {
                            const leftCopy = context.modelFactory.createElement(left) as SChildElement & Fadeable
                            parent.add(leftCopy)
                            animationData.fades.push({
                                element: leftCopy,
                                type: 'out'
                            })
                        }
                    }
                }
            }
        }

        const animations = this.createAnimations(animationData, newRoot, context)
        if (animations.length >= 2) {
            return new CompoundAnimation(newRoot, context, animations)
        } else if (animations.length === 1) {
            return animations[0]
        } else {
            return newRoot
        }
    }

    protected updateElement(left: SModelElement, right: SModelElement, animationData: UpdateAnimationData): void {
        if (isLocateable(left) && isLocateable(right)) {
            const leftPos = left.position
            const rightPos = right.position
            if (!almostEquals(leftPos.x, rightPos.x) || !almostEquals(leftPos.y, rightPos.y)) {
                if (animationData.moves === undefined)
                    animationData.moves = []
                animationData.moves.push({
                    element: right,
                    elementId: right.id,
                    fromPosition: leftPos,
                    toPosition: rightPos
                })
                right.position = leftPos
            }
        }
        if (isBoundsAware(left) && isBoundsAware(right)) {
            if (!isValidDimension(right.bounds)) {
                right.bounds = {
                    x: right.bounds.x,
                    y: right.bounds.y,
                    width: left.bounds.width,
                    height: left.bounds.height
                }
            } else if (!almostEquals(left.bounds.width, right.bounds.width)
                    || !almostEquals(left.bounds.height, right.bounds.height)) {
                if (animationData.resizes === undefined)
                    animationData.resizes = []
                animationData.resizes.push({
                    element: right,
                    fromDimension: {
                        width: left.bounds.width,
                        height: left.bounds.height,
                    },
                    toDimension: {
                        width: right.bounds.width,
                        height: right.bounds.height,
                    }
                })
            }
        }
        if (isSelectable(left) && isSelectable(right)) {
            right.selected = left.selected
        }
        if (left instanceof SModelRoot && right instanceof SModelRoot) {
            right.canvasBounds = left.canvasBounds
        }
        if (left instanceof ViewportRootElement && right instanceof ViewportRootElement) {
            right.scroll = left.scroll
            right.zoom = left.zoom
        }
    }

    protected createAnimations(data: UpdateAnimationData, root: SModelRoot, context: CommandExecutionContext): Animation[] {
        const animations: Animation[] = []
        if (data.fades.length > 0) {
            animations.push(new FadeAnimation(root, data.fades, context, true))
        }
        if (data.moves !== undefined && data.moves.length > 0) {
            const movesMap: Map<string, ResolvedElementMove> = new Map
            for (const move of data.moves) {
                movesMap.set(move.elementId, move)
            }
            animations.push(new MoveAnimation(root, movesMap, context, false))
        }
        if (data.resizes !== undefined && data.resizes.length > 0) {
            const resizesMap: Map<string, ResolvedElementResize> = new Map
            for (const resize of data.resizes) {
                resizesMap.set(resize.element.id, resize)
            }
            animations.push(new ResizeAnimation(root, resizesMap, context, false))
        }
        return animations
    }

    undo(context: CommandExecutionContext): CommandResult {
        return this.performUpdate(this.newRoot, this.oldRoot, context)
    }

    redo(context: CommandExecutionContext): CommandResult {
        return this.performUpdate(this.oldRoot, this.newRoot, context)
    }
}

