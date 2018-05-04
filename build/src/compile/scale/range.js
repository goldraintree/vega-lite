import { isNumber } from 'vega-util';
import { COLOR, FILL, OPACITY, SCALE_CHANNELS, SHAPE, SIZE, STROKE, X, Y } from '../../channel';
import * as log from '../../log';
import { channelScalePropertyIncompatability, isExtendedScheme, scaleTypeSupportProperty, } from '../../scale';
import { hasContinuousDomain } from '../../scale';
import * as util from '../../util';
import { isVgRangeStep } from '../../vega.schema';
import { isUnitModel } from '../model';
import { makeExplicit, makeImplicit } from '../split';
import { parseNonUnitScaleProperty } from './properties';
export var RANGE_PROPERTIES = ['range', 'rangeStep', 'scheme'];
export function parseScaleRange(model) {
    if (isUnitModel(model)) {
        parseUnitScaleRange(model);
    }
    else {
        parseNonUnitScaleProperty(model, 'range');
    }
}
function parseUnitScaleRange(model) {
    var localScaleComponents = model.component.scales;
    // use SCALE_CHANNELS instead of scales[channel] to ensure that x, y come first!
    SCALE_CHANNELS.forEach(function (channel) {
        var localScaleCmpt = localScaleComponents[channel];
        if (!localScaleCmpt) {
            return;
        }
        var mergedScaleCmpt = model.getScaleComponent(channel);
        var specifiedScale = model.specifiedScales[channel];
        var fieldDef = model.fieldDef(channel);
        // Read if there is a specified width/height
        var sizeType = channel === 'x' ? 'width' : channel === 'y' ? 'height' : undefined;
        var sizeSpecified = sizeType ? !!model.component.layoutSize.get(sizeType) : undefined;
        var scaleType = mergedScaleCmpt.get('type');
        // if autosize is fit, size cannot be data driven
        var rangeStep = util.contains(['point', 'band'], scaleType) || !!specifiedScale.rangeStep;
        if (sizeType && model.fit && !sizeSpecified && rangeStep) {
            log.warn(log.message.CANNOT_FIX_RANGE_STEP_WITH_FIT);
            sizeSpecified = true;
        }
        var xyRangeSteps = getXYRangeStep(model);
        var rangeWithExplicit = parseRangeForChannel(channel, scaleType, fieldDef.type, specifiedScale, model.config, localScaleCmpt.get('zero'), model.mark, sizeSpecified, model.getName(sizeType), xyRangeSteps);
        localScaleCmpt.setWithExplicit('range', rangeWithExplicit);
    });
}
function getXYRangeStep(model) {
    var xyRangeSteps = [];
    var xScale = model.getScaleComponent('x');
    var xRange = xScale && xScale.get('range');
    if (xRange && isVgRangeStep(xRange) && isNumber(xRange.step)) {
        xyRangeSteps.push(xRange.step);
    }
    var yScale = model.getScaleComponent('y');
    var yRange = yScale && yScale.get('range');
    if (yRange && isVgRangeStep(yRange) && isNumber(yRange.step)) {
        xyRangeSteps.push(yRange.step);
    }
    return xyRangeSteps;
}
/**
 * Return mixins that includes one of the range properties (range, rangeStep, scheme).
 */
export function parseRangeForChannel(channel, scaleType, type, specifiedScale, config, zero, mark, sizeSpecified, sizeSignal, xyRangeSteps) {
    var noRangeStep = sizeSpecified || specifiedScale.rangeStep === null;
    // Check if any of the range properties is specified.
    // If so, check if it is compatible and make sure that we only output one of the properties
    for (var _i = 0, RANGE_PROPERTIES_1 = RANGE_PROPERTIES; _i < RANGE_PROPERTIES_1.length; _i++) {
        var property = RANGE_PROPERTIES_1[_i];
        if (specifiedScale[property] !== undefined) {
            var supportedByScaleType = scaleTypeSupportProperty(scaleType, property);
            var channelIncompatability = channelScalePropertyIncompatability(channel, property);
            if (!supportedByScaleType) {
                log.warn(log.message.scalePropertyNotWorkWithScaleType(scaleType, property, channel));
            }
            else if (channelIncompatability) { // channel
                log.warn(channelIncompatability);
            }
            else {
                switch (property) {
                    case 'range':
                        return makeExplicit(specifiedScale[property]);
                    case 'scheme':
                        return makeExplicit(parseScheme(specifiedScale[property]));
                    case 'rangeStep':
                        var rangeStep = specifiedScale[property];
                        if (rangeStep !== null) {
                            if (!sizeSpecified) {
                                return makeExplicit({ step: rangeStep });
                            }
                            else {
                                // If top-level size is specified, we ignore specified rangeStep.
                                log.warn(log.message.rangeStepDropped(channel));
                            }
                        }
                }
            }
        }
    }
    return makeImplicit(defaultRange(channel, scaleType, type, config, zero, mark, sizeSignal, xyRangeSteps, noRangeStep));
}
function parseScheme(scheme) {
    if (isExtendedScheme(scheme)) {
        var r = { scheme: scheme.name };
        if (scheme.count) {
            r.count = scheme.count;
        }
        if (scheme.extent) {
            r.extent = scheme.extent;
        }
        return r;
    }
    return { scheme: scheme };
}
export function defaultRange(channel, scaleType, type, config, zero, mark, sizeSignal, xyRangeSteps, noRangeStep) {
    switch (channel) {
        case X:
        case Y:
            if (util.contains(['point', 'band'], scaleType) && !noRangeStep) {
                if (channel === X && mark === 'text') {
                    if (config.scale.textXRangeStep) {
                        return { step: config.scale.textXRangeStep };
                    }
                }
                else {
                    if (config.scale.rangeStep) {
                        return { step: config.scale.rangeStep };
                    }
                }
            }
            // If range step is null, use zero to width or height.
            // Note that these range signals are temporary
            // as they can be merged and renamed.
            // (We do not have the right size signal here since parseLayoutSize() happens after parseScale().)
            // We will later replace these temporary names with
            // the final name in assembleScaleRange()
            if (channel === Y && hasContinuousDomain(scaleType)) {
                // For y continuous scale, we have to start from the height as the bottom part has the max value.
                return [{ signal: sizeSignal }, 0];
            }
            else {
                return [0, { signal: sizeSignal }];
            }
        case SIZE:
            // TODO: support custom rangeMin, rangeMax
            var rangeMin = sizeRangeMin(mark, zero, config);
            var rangeMax = sizeRangeMax(mark, xyRangeSteps, config);
            return [rangeMin, rangeMax];
        case SHAPE:
            return 'symbol';
        case COLOR:
        case FILL:
        case STROKE:
            if (scaleType === 'ordinal') {
                // Only nominal data uses ordinal scale by default
                return type === 'nominal' ? 'category' : 'ordinal';
            }
            return mark === 'rect' || mark === 'geoshape' ? 'heatmap' : 'ramp';
        case OPACITY:
            // TODO: support custom rangeMin, rangeMax
            return [config.scale.minOpacity, config.scale.maxOpacity];
    }
    /* istanbul ignore next: should never reach here */
    throw new Error("Scale range undefined for channel " + channel);
}
function sizeRangeMin(mark, zero, config) {
    if (zero) {
        return 0;
    }
    switch (mark) {
        case 'bar':
        case 'tick':
            return config.scale.minBandSize;
        case 'line':
        case 'trail':
        case 'rule':
            return config.scale.minStrokeWidth;
        case 'text':
            return config.scale.minFontSize;
        case 'point':
        case 'square':
        case 'circle':
            return config.scale.minSize;
    }
    /* istanbul ignore next: should never reach here */
    // sizeRangeMin not implemented for the mark
    throw new Error(log.message.incompatibleChannel('size', mark));
}
function sizeRangeMax(mark, xyRangeSteps, config) {
    var scaleConfig = config.scale;
    // TODO(#1168): make max size scale based on rangeStep / overall plot size
    switch (mark) {
        case 'bar':
        case 'tick':
            if (config.scale.maxBandSize !== undefined) {
                return config.scale.maxBandSize;
            }
            return minXYRangeStep(xyRangeSteps, config.scale) - 1;
        case 'line':
        case 'trail':
        case 'rule':
            return config.scale.maxStrokeWidth;
        case 'text':
            return config.scale.maxFontSize;
        case 'point':
        case 'square':
        case 'circle':
            if (config.scale.maxSize) {
                return config.scale.maxSize;
            }
            // FIXME this case totally should be refactored
            var pointStep = minXYRangeStep(xyRangeSteps, scaleConfig);
            return (pointStep - 2) * (pointStep - 2);
    }
    /* istanbul ignore next: should never reach here */
    // sizeRangeMax not implemented for the mark
    throw new Error(log.message.incompatibleChannel('size', mark));
}
/**
 * @returns {number} Range step of x or y or minimum between the two if both are ordinal scale.
 */
function minXYRangeStep(xyRangeSteps, scaleConfig) {
    if (xyRangeSteps.length > 0) {
        return Math.min.apply(null, xyRangeSteps);
    }
    if (scaleConfig.rangeStep) {
        return scaleConfig.rangeStep;
    }
    return 21; // FIXME: re-evaluate the default value here.
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmFuZ2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvY29tcGlsZS9zY2FsZS9yYW5nZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUMsUUFBUSxFQUFDLE1BQU0sV0FBVyxDQUFDO0FBRW5DLE9BQU8sRUFBVSxLQUFLLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQWdCLEtBQUssRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUMsTUFBTSxlQUFlLENBQUM7QUFFckgsT0FBTyxLQUFLLEdBQUcsTUFBTSxXQUFXLENBQUM7QUFFakMsT0FBTyxFQUNMLG1DQUFtQyxFQUNuQyxnQkFBZ0IsRUFLaEIsd0JBQXdCLEdBRXpCLE1BQU0sYUFBYSxDQUFDO0FBQ3JCLE9BQU8sRUFBQyxtQkFBbUIsRUFBQyxNQUFNLGFBQWEsQ0FBQztBQUVoRCxPQUFPLEtBQUssSUFBSSxNQUFNLFlBQVksQ0FBQztBQUNuQyxPQUFPLEVBQUMsYUFBYSxFQUFvQixNQUFNLG1CQUFtQixDQUFDO0FBQ25FLE9BQU8sRUFBQyxXQUFXLEVBQVEsTUFBTSxVQUFVLENBQUM7QUFDNUMsT0FBTyxFQUFXLFlBQVksRUFBRSxZQUFZLEVBQUMsTUFBTSxVQUFVLENBQUM7QUFHOUQsT0FBTyxFQUFDLHlCQUF5QixFQUFDLE1BQU0sY0FBYyxDQUFDO0FBS3ZELE1BQU0sQ0FBQyxJQUFNLGdCQUFnQixHQUFvQixDQUFDLE9BQU8sRUFBRSxXQUFXLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFHbEYsTUFBTSwwQkFBMEIsS0FBWTtJQUMxQyxJQUFJLFdBQVcsQ0FBQyxLQUFLLENBQUMsRUFBRTtRQUN0QixtQkFBbUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztLQUM1QjtTQUFNO1FBQ0wseUJBQXlCLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0tBQzNDO0FBQ0gsQ0FBQztBQUVELDZCQUE2QixLQUFn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QUVELCtDQUErQztZQUMvQyxJQUFNLFNBQVMsR0FBRyxjQUFjLENBQUMsWUFBWSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1lBQzVELE9BQU8sQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUM7S0FDNUM7SUFDRCxtREFBbUQ7SUFDbkQsNENBQTRDO0lBQzVDLE1BQU0sSUFBSSxLQUFLLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUNqRSxDQUFDO0FBRUQ7O0dBRUc7QUFDSCx3QkFBd0IsWUFBc0IsRUFBRSxXQUF3QjtJQUN0RSxJQUFJLFlBQVksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO1FBQzNCLE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLFlBQVksQ0FBQyxDQUFDO0tBQzNDO0lBQ0QsSUFBSSxXQUFXLENBQUMsU0FBUyxFQUFFO1FBQ3pCLE9BQU8sV0FBVyxDQUFDLFNBQVMsQ0FBQztLQUM5QjtJQUNELE9BQU8sRUFBRSxDQUFDLENBQUMsNkNBQTZDO0FBQzFELENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge2lzTnVtYmVyfSBmcm9tICd2ZWdhLXV0aWwnO1xuXG5pbXBvcnQge0NoYW5uZWwsIENPTE9SLCBGSUxMLCBPUEFDSVRZLCBTQ0FMRV9DSEFOTkVMUywgU2NhbGVDaGFubmVsLCBTSEFQRSwgU0laRSwgU1RST0tFLCBYLCBZfSBmcm9tICcuLi8uLi9jaGFubmVsJztcbmltcG9ydCB7Q29uZmlnfSBmcm9tICcuLi8uLi9jb25maWcnO1xuaW1wb3J0ICogYXMgbG9nIGZyb20gJy4uLy4uL2xvZyc7XG5pbXBvcnQge01hcmt9IGZyb20gJy4uLy4uL21hcmsnO1xuaW1wb3J0IHtcbiAgY2hhbm5lbFNjYWxlUHJvcGVydHlJbmNvbXBhdGFiaWxpdHksXG4gIGlzRXh0ZW5kZWRTY2hlbWUsXG4gIFJhbmdlLFxuICBTY2FsZSxcbiAgU2NhbGVDb25maWcsXG4gIFNjYWxlVHlwZSxcbiAgc2NhbGVUeXBlU3VwcG9ydFByb3BlcnR5LFxuICBTY2hlbWUsXG59IGZyb20gJy4uLy4uL3NjYWxlJztcbmltcG9ydCB7aGFzQ29udGludW91c0RvbWFpbn0gZnJvbSAnLi4vLi4vc2NhbGUnO1xuaW1wb3J0IHtUeXBlfSBmcm9tICcuLi8uLi90eXBlJztcbmltcG9ydCAqIGFzIHV0aWwgZnJvbSAnLi4vLi4vdXRpbCc7XG5pbXBvcnQge2lzVmdSYW5nZVN0ZXAsIFZnUmFuZ2UsIFZnU2NoZW1lfSBmcm9tICcuLi8uLi92ZWdhLnNjaGVtYSc7XG5pbXBvcnQge2lzVW5pdE1vZGVsLCBNb2RlbH0gZnJvbSAnLi4vbW9kZWwnO1xuaW1wb3J0IHtFeHBsaWNpdCwgbWFrZUV4cGxpY2l0LCBtYWtlSW1wbGljaXR9IGZyb20gJy4uL3NwbGl0JztcbmltcG9ydCB7VW5pdE1vZGVsfSBmcm9tICcuLi91bml0JztcbmltcG9ydCB7U2NhbGVDb21wb25lbnRJbmRleH0gZnJvbSAnLi9jb21wb25lbnQnO1xuaW1wb3J0IHtwYXJzZU5vblVuaXRTY2FsZVByb3BlcnR5fSBmcm9tICcuL3Byb3BlcnRpZXMnO1xuXG5cbmV4cG9ydCB0eXBlIFJhbmdlTWl4aW5zID0ge3JhbmdlOiBSYW5nZX0gfCB7cmFuZ2VTdGVwOiBudW1iZXJ9IHwge3NjaGVtZTogU2NoZW1lfTtcblxuZXhwb3J0IGNvbnN0IFJBTkdFX1BST1BFUlRJRVM6IChrZXlvZiBTY2FsZSlbXSA9IFsncmFuZ2UnLCAncmFuZ2VTdGVwJywgJ3NjaGVtZSddO1xuXG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVNjYWxlUmFuZ2UobW9kZWw6IE1vZGVsKSB7XG4gIGlmIChpc1VuaXRNb2RlbChtb2RlbCkpIHtcbiAgICBwYXJzZVVuaXRTY2FsZVJhbmdlKG1vZGVsKTtcbiAgfSBlbHNlIHtcbiAgICBwYXJzZU5vblVuaXRTY2FsZVByb3BlcnR5KG1vZGVsLCAncmFuZ2UnKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBwYXJzZVVuaXRTY2FsZVJhbmdlKG1vZGVsOiBVbml0TW9kZWwpIHtcbiAgY29uc3QgbG9jYWxTY2FsZUNvbXBvbmVudHM6IFNjYWxlQ29tcG9uZW50SW5kZXggPSBtb2RlbC5jb21wb25lbnQuc2NhbGVzO1xuXG4gIC8vIHVzZSBTQ0FMRV9DSEFOTkVMUyBpbnN0ZWFkIG9mIHNjYWxlc1tjaGFubmVsXSB0byBlbnN1cmUgdGhhdCB4LCB5IGNvbWUgZmlyc3QhXG4gIFNDQUxFX0NIQU5ORUxTLmZvckVhY2goKGNoYW5uZWw6IFNjYWxlQ2hhbm5lbCkgPT4ge1xuICAgIGNvbnN0IGxvY2FsU2NhbGVDbXB0ID0gbG9jYWxTY2FsZUNvbXBvbmVudHNbY2hhbm5lbF07XG4gICAgaWYgKCFsb2NhbFNjYWxlQ21wdCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBtZXJnZWRTY2FsZUNtcHQgPSBtb2RlbC5nZXRTY2FsZUNvbXBvbmVudChjaGFubmVsKTtcblxuXG4gICAgY29uc3Qgc3BlY2lmaWVkU2NhbGUgPSBtb2RlbC5zcGVjaWZpZWRTY2FsZXNbY2hhbm5lbF07XG4gICAgY29uc3QgZmllbGREZWYgPSBtb2RlbC5maWVsZERlZihjaGFubmVsKTtcblxuICAgIC8vIFJlYWQgaWYgdGhlcmUgaXMgYSBzcGVjaWZpZWQgd2lkdGgvaGVpZ2h0XG4gICAgY29uc3Qgc2l6ZVR5cGUgPSBjaGFubmVsID09PSAneCcgPyAnd2lkdGgnIDogY2hhbm5lbCA9PT0gJ3knID8gJ2hlaWdodCcgOiB1bmRlZmluZWQ7XG4gICAgbGV0IHNpemVTcGVjaWZpZWQgPSBzaXplVHlwZSA/ICEhbW9kZWwuY29tcG9uZW50LmxheW91dFNpemUuZ2V0KHNpemVUeXBlKSA6IHVuZGVmaW5lZDtcblxuICAgIGNvbnN0IHNjYWxlVHlwZSA9IG1lcmdlZFNjYWxlQ21wdC5nZXQoJ3R5cGUnKTtcblxuICAgIC8vIGlmIGF1dG9zaXplIGlzIGZpdCwgc2l6ZSBjYW5ub3QgYmUgZGF0YSBkcml2ZW5cbiAgICBjb25zdCByYW5nZVN0ZXAgPSB1dGlsLmNvbnRhaW5zKFsncG9pbnQnLCAnYmFuZCddLCBzY2FsZVR5cGUpIHx8ICEhc3BlY2lmaWVkU2NhbGUucmFuZ2VTdGVwO1xuICAgIGlmIChzaXplVHlwZSAmJiBtb2RlbC5maXQgJiYgIXNpemVTcGVjaWZpZWQgJiYgcmFuZ2VTdGVwKSB7XG4gICAgICBsb2cud2Fybihsb2cubWVzc2FnZS5DQU5OT1RfRklYX1JBTkdFX1NURVBfV0lUSF9GSVQpO1xuICAgICAgc2l6ZVNwZWNpZmllZCA9IHRydWU7XG4gICAgfVxuXG4gICAgY29uc3QgeHlSYW5nZVN0ZXBzID0gZ2V0WFlSYW5nZVN0ZXAobW9kZWwpO1xuXG4gICAgY29uc3QgcmFuZ2VXaXRoRXhwbGljaXQgPSBwYXJzZVJhbmdlRm9yQ2hhbm5lbChcbiAgICAgIGNoYW5uZWwsIHNjYWxlVHlwZSwgZmllbGREZWYudHlwZSwgc3BlY2lmaWVkU2NhbGUsIG1vZGVsLmNvbmZpZyxcbiAgICAgIGxvY2FsU2NhbGVDbXB0LmdldCgnemVybycpLCBtb2RlbC5tYXJrLCBzaXplU3BlY2lmaWVkLCBtb2RlbC5nZXROYW1lKHNpemVUeXBlKSwgeHlSYW5nZVN0ZXBzXG4gICAgKTtcblxuICAgIGxvY2FsU2NhbGVDbXB0LnNldFdpdGhFeHBsaWNpdCgncmFuZ2UnLCByYW5nZVdpdGhFeHBsaWNpdCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBnZXRYWVJhbmdlU3RlcChtb2RlbDogVW5pdE1vZGVsKSB7XG4gIGNvbnN0IHh5UmFuZ2VTdGVwczogbnVtYmVyW10gPSBbXTtcblxuICBjb25zdCB4U2NhbGUgPSBtb2RlbC5nZXRTY2FsZUNvbXBvbmVudCgneCcpO1xuICBjb25zdCB4UmFuZ2UgPSB4U2NhbGUgJiYgeFNjYWxlLmdldCgncmFuZ2UnKTtcbiAgaWYgKHhSYW5nZSAmJiBpc1ZnUmFuZ2VTdGVwKHhSYW5nZSkgJiYgaXNOdW1iZXIoeFJhbmdlLnN0ZXApKSB7XG4gICAgeHlSYW5nZVN0ZXBzLnB1c2goeFJhbmdlLnN0ZXApO1xuICB9XG5cbiAgY29uc3QgeVNjYWxlID0gbW9kZWwuZ2V0U2NhbGVDb21wb25lbnQoJ3knKTtcbiAgY29uc3QgeVJhbmdlID0geVNjYWxlICYmIHlTY2FsZS5nZXQoJ3JhbmdlJyk7XG4gIGlmICh5UmFuZ2UgJiYgaXNWZ1JhbmdlU3RlcCh5UmFuZ2UpICYmIGlzTnVtYmVyKHlSYW5nZS5zdGVwKSkge1xuICAgIHh5UmFuZ2VTdGVwcy5wdXNoKHlSYW5nZS5zdGVwKTtcbiAgfVxuXG4gIHJldHVybiB4eVJhbmdlU3RlcHM7XG59XG5cbi8qKlxuICogUmV0dXJuIG1peGlucyB0aGF0IGluY2x1ZGVzIG9uZSBvZiB0aGUgcmFuZ2UgcHJvcGVydGllcyAocmFuZ2UsIHJhbmdlU3RlcCwgc2NoZW1lKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlUmFuZ2VGb3JDaGFubmVsKFxuICAgIGNoYW5uZWw6IENoYW5uZWwsIHNjYWxlVHlwZTogU2NhbGVUeXBlLCB0eXBlOiBUeXBlLCBzcGVjaWZpZWRTY2FsZTogU2NhbGUsIGNvbmZpZzogQ29uZmlnLFxuICAgIHplcm86IGJvb2xlYW4sIG1hcms6IE1hcmssIHNpemVTcGVjaWZpZWQ6IGJvb2xlYW4sIHNpemVTaWduYWw6IHN0cmluZywgeHlSYW5nZVN0ZXBzOiBudW1iZXJbXVxuICApOiBFeHBsaWNpdDxWZ1JhbmdlPiB7XG5cbiAgY29uc3Qgbm9SYW5nZVN0ZXAgPSBzaXplU3BlY2lmaWVkIHx8IHNwZWNpZmllZFNjYWxlLnJhbmdlU3RlcCA9PT0gbnVsbDtcblxuICAvLyBDaGVjayBpZiBhbnkgb2YgdGhlIHJhbmdlIHByb3BlcnRpZXMgaXMgc3BlY2lmaWVkLlxuICAvLyBJZiBzbywgY2hlY2sgaWYgaXQgaXMgY29tcGF0aWJsZSBhbmQgbWFrZSBzdXJlIHRoYXQgd2Ugb25seSBvdXRwdXQgb25lIG9mIHRoZSBwcm9wZXJ0aWVzXG4gIGZvciAoY29uc3QgcHJvcGVydHkgb2YgUkFOR0VfUFJPUEVSVElFUykge1xuICAgIGlmIChzcGVjaWZpZWRTY2FsZVtwcm9wZXJ0eV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgY29uc3Qgc3VwcG9ydGVkQnlTY2FsZVR5cGUgPSBzY2FsZVR5cGVTdXBwb3J0UHJvcGVydHkoc2NhbGVUeXBlLCBwcm9wZXJ0eSk7XG4gICAgICBjb25zdCBjaGFubmVsSW5jb21wYXRhYmlsaXR5ID0gY2hhbm5lbFNjYWxlUHJvcGVydHlJbmNvbXBhdGFiaWxpdHkoY2hhbm5lbCwgcHJvcGVydHkpO1xuICAgICAgaWYgKCFzdXBwb3J0ZWRCeVNjYWxlVHlwZSkge1xuICAgICAgICBsb2cud2Fybihsb2cubWVzc2FnZS5zY2FsZVByb3BlcnR5Tm90V29ya1dpdGhTY2FsZVR5cGUoc2NhbGVUeXBlLCBwcm9wZXJ0eSwgY2hhbm5lbCkpO1xuICAgICAgfSBlbHNlIGlmIChjaGFubmVsSW5jb21wYXRhYmlsaXR5KSB7IC8vIGNoYW5uZWxcbiAgICAgICAgbG9nLndhcm4oY2hhbm5lbEluY29tcGF0YWJpbGl0eSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzd2l0Y2ggKHByb3BlcnR5KSB7XG4gICAgICAgICAgY2FzZSAncmFuZ2UnOlxuICAgICAgICAgICAgcmV0dXJuIG1ha2VFeHBsaWNpdChzcGVjaWZpZWRTY2FsZVtwcm9wZXJ0eV0pO1xuICAgICAgICAgIGNhc2UgJ3NjaGVtZSc6XG4gICAgICAgICAgICByZXR1cm4gbWFrZUV4cGxpY2l0KHBhcnNlU2NoZW1lKHNwZWNpZmllZFNjYWxlW3Byb3BlcnR5XSkpO1xuICAgICAgICAgIGNhc2UgJ3JhbmdlU3RlcCc6XG4gICAgICAgICAgICBjb25zdCByYW5nZVN0ZXAgPSBzcGVjaWZpZWRTY2FsZVtwcm9wZXJ0eV07XG4gICAgICAgICAgICBpZiAocmFuZ2VTdGVwICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgIGlmICghc2l6ZVNwZWNpZmllZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBtYWtlRXhwbGljaXQoe3N0ZXA6IHJhbmdlU3RlcH0pO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIElmIHRvcC1sZXZlbCBzaXplIGlzIHNwZWNpZmllZCwgd2UgaWdub3JlIHNwZWNpZmllZCByYW5nZVN0ZXAuXG4gICAgICAgICAgICAgICAgbG9nLndhcm4obG9nLm1lc3NhZ2UucmFuZ2VTdGVwRHJvcHBlZChjaGFubmVsKSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gbWFrZUltcGxpY2l0KFxuICAgIGRlZmF1bHRSYW5nZShcbiAgICAgIGNoYW5uZWwsIHNjYWxlVHlwZSwgdHlwZSwgY29uZmlnLFxuICAgICAgemVybywgbWFyaywgc2l6ZVNpZ25hbCwgeHlSYW5nZVN0ZXBzLCBub1JhbmdlU3RlcFxuICAgIClcbiAgKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VTY2hlbWUoc2NoZW1lOiBTY2hlbWUpIHtcbiAgaWYgKGlzRXh0ZW5kZWRTY2hlbWUoc2NoZW1lKSkge1xuICAgIGNvbnN0IHI6IFZnU2NoZW1lID0ge3NjaGVtZTogc2NoZW1lLm5hbWV9O1xuICAgIGlmIChzY2hlbWUuY291bnQpIHtcbiAgICAgIHIuY291bnQgPSBzY2hlbWUuY291bnQ7XG4gICAgfVxuICAgIGlmIChzY2hlbWUuZXh0ZW50KSB7XG4gICAgICByLmV4dGVudCA9IHNjaGVtZS5leHRlbnQ7XG4gICAgfVxuICAgIHJldHVybiByO1xuICB9XG4gIHJldHVybiB7c2NoZW1lOiBzY2hlbWV9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVmYXVsdFJhbmdlKFxuICBjaGFubmVsOiBDaGFubmVsLCBzY2FsZVR5cGU6IFNjYWxlVHlwZSwgdHlwZTogVHlwZSwgY29uZmlnOiBDb25maWcsIHplcm86IGJvb2xlYW4sIG1hcms6IE1hcmssXG4gIHNpemVTaWduYWw6IHN0cmluZywgeHlSYW5nZVN0ZXBzOiBudW1iZXJbXSwgbm9SYW5nZVN0ZXA6IGJvb2xlYW5cbik6IFZnUmFuZ2Uge1xuICBzd2l0Y2ggKGNoYW5uZWwpIHtcbiAgICBjYXNlIFg6XG4gICAgY2FzZSBZOlxuICAgICAgaWYgKHV0aWwuY29udGFpbnMoWydwb2ludCcsICdiYW5kJ10sIHNjYWxlVHlwZSkgJiYgIW5vUmFuZ2VTdGVwKSB7XG4gICAgICAgIGlmIChjaGFubmVsID09PSBYICYmIG1hcmsgPT09ICd0ZXh0Jykge1xuICAgICAgICAgIGlmIChjb25maWcuc2NhbGUudGV4dFhSYW5nZVN0ZXApIHtcbiAgICAgICAgICAgIHJldHVybiB7c3RlcDogY29uZmlnLnNjYWxlLnRleHRYUmFuZ2VTdGVwfTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKGNvbmZpZy5zY2FsZS5yYW5nZVN0ZXApIHtcbiAgICAgICAgICAgIHJldHVybiB7c3RlcDogY29uZmlnLnNjYWxlLnJhbmdlU3RlcH07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIElmIHJhbmdlIHN0ZXAgaXMgbnVsbCwgdXNlIHplcm8gdG8gd2lkdGggb3IgaGVpZ2h0LlxuICAgICAgLy8gTm90ZSB0aGF0IHRoZXNlIHJhbmdlIHNpZ25hbHMgYXJlIHRlbXBvcmFyeVxuICAgICAgLy8gYXMgdGhleSBjYW4gYmUgbWVyZ2VkIGFuZCByZW5hbWVkLlxuICAgICAgLy8gKFdlIGRvIG5vdCBoYXZlIHRoZSByaWdodCBzaXplIHNpZ25hbCBoZXJlIHNpbmNlIHBhcnNlTGF5b3V0U2l6ZSgpIGhhcHBlbnMgYWZ0ZXIgcGFyc2VTY2FsZSgpLilcbiAgICAgIC8vIFdlIHdpbGwgbGF0ZXIgcmVwbGFjZSB0aGVzZSB0ZW1wb3JhcnkgbmFtZXMgd2l0aFxuICAgICAgLy8gdGhlIGZpbmFsIG5hbWUgaW4gYXNzZW1ibGVTY2FsZVJhbmdlKClcblxuICAgICAgaWYgKGNoYW5uZWwgPT09IFkgJiYgaGFzQ29udGludW91c0RvbWFpbihzY2FsZVR5cGUpKSB7XG4gICAgICAgIC8vIEZvciB5IGNvbnRpbnVvdXMgc2NhbGUsIHdlIGhhdmUgdG8gc3RhcnQgZnJvbSB0aGUgaGVpZ2h0IGFzIHRoZSBib3R0b20gcGFydCBoYXMgdGhlIG1heCB2YWx1ZS5cbiAgICAgICAgcmV0dXJuIFt7c2lnbmFsOiBzaXplU2lnbmFsfSwgMF07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gWzAsIHtzaWduYWw6IHNpemVTaWduYWx9XTtcbiAgICAgIH1cbiAgICBjYXNlIFNJWkU6XG4gICAgICAvLyBUT0RPOiBzdXBwb3J0IGN1c3RvbSByYW5nZU1pbiwgcmFuZ2VNYXhcbiAgICAgIGNvbnN0IHJhbmdlTWluID0gc2l6ZVJhbmdlTWluKG1hcmssIHplcm8sIGNvbmZpZyk7XG4gICAgICBjb25zdCByYW5nZU1heCA9IHNpemVSYW5nZU1heChtYXJrLCB4eVJhbmdlU3RlcHMsIGNvbmZpZyk7XG4gICAgICByZXR1cm4gW3JhbmdlTWluLCByYW5nZU1heF07XG4gICAgY2FzZSBTSEFQRTpcbiAgICAgIHJldHVybiAnc3ltYm9sJztcbiAgICBjYXNlIENPTE9SOlxuICAgIGNhc2UgRklMTDpcbiAgICBjYXNlIFNUUk9LRTpcbiAgICAgIGlmIChzY2FsZVR5cGUgPT09ICdvcmRpbmFsJykge1xuICAgICAgICAvLyBPbmx5IG5vbWluYWwgZGF0YSB1c2VzIG9yZGluYWwgc2NhbGUgYnkgZGVmYXVsdFxuICAgICAgICByZXR1cm4gdHlwZSA9PT0gJ25vbWluYWwnID8gJ2NhdGVnb3J5JyA6ICdvcmRpbmFsJztcbiAgICAgIH1cbiAgICAgIHJldHVybiBtYXJrID09PSAncmVjdCcgfHwgbWFyayA9PT0gJ2dlb3NoYXBlJyA/ICdoZWF0bWFwJyA6ICdyYW1wJztcbiAgICBjYXNlIE9QQUNJVFk6XG4gICAgICAvLyBUT0RPOiBzdXBwb3J0IGN1c3RvbSByYW5nZU1pbiwgcmFuZ2VNYXhcbiAgICAgIHJldHVybiBbY29uZmlnLnNjYWxlLm1pbk9wYWNpdHksIGNvbmZpZy5zY2FsZS5tYXhPcGFjaXR5XTtcbiAgfVxuICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogc2hvdWxkIG5ldmVyIHJlYWNoIGhlcmUgKi9cbiAgdGhyb3cgbmV3IEVycm9yKGBTY2FsZSByYW5nZSB1bmRlZmluZWQgZm9yIGNoYW5uZWwgJHtjaGFubmVsfWApO1xufVxuXG5mdW5jdGlvbiBzaXplUmFuZ2VNaW4obWFyazogTWFyaywgemVybzogYm9vbGVhbiwgY29uZmlnOiBDb25maWcpIHtcbiAgaWYgKHplcm8pIHtcbiAgICByZXR1cm4gMDtcbiAgfVxuICBzd2l0Y2ggKG1hcmspIHtcbiAgICBjYXNlICdiYXInOlxuICAgIGNhc2UgJ3RpY2snOlxuICAgICAgcmV0dXJuIGNvbmZpZy5zY2FsZS5taW5CYW5kU2l6ZTtcbiAgICBjYXNlICdsaW5lJzpcbiAgICBjYXNlICd0cmFpbCc6XG4gICAgY2FzZSAncnVsZSc6XG4gICAgICByZXR1cm4gY29uZmlnLnNjYWxlLm1pblN0cm9rZVdpZHRoO1xuICAgIGNhc2UgJ3RleHQnOlxuICAgICAgcmV0dXJuIGNvbmZpZy5zY2FsZS5taW5Gb250U2l6ZTtcbiAgICBjYXNlICdwb2ludCc6XG4gICAgY2FzZSAnc3F1YXJlJzpcbiAgICBjYXNlICdjaXJjbGUnOlxuICAgICAgcmV0dXJuIGNvbmZpZy5zY2FsZS5taW5TaXplO1xuICB9XG4gIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBzaG91bGQgbmV2ZXIgcmVhY2ggaGVyZSAqL1xuICAvLyBzaXplUmFuZ2VNaW4gbm90IGltcGxlbWVudGVkIGZvciB0aGUgbWFya1xuICB0aHJvdyBuZXcgRXJyb3IobG9nLm1lc3NhZ2UuaW5jb21wYXRpYmxlQ2hhbm5lbCgnc2l6ZScsIG1hcmspKTtcbn1cblxuZnVuY3Rpb24gc2l6ZVJhbmdlTWF4KG1hcms6IE1hcmssIHh5UmFuZ2VTdGVwczogbnVtYmVyW10sIGNvbmZpZzogQ29uZmlnKSB7XG4gIGNvbnN0IHNjYWxlQ29uZmlnID0gY29uZmlnLnNjYWxlO1xuICAvLyBUT0RPKCMxMTY4KTogbWFrZSBtYXggc2l6ZSBzY2FsZSBiYXNlZCBvbiByYW5nZVN0ZXAgLyBvdmVyYWxsIHBsb3Qgc2l6ZVxuICBzd2l0Y2ggKG1hcmspIHtcbiAgICBjYXNlICdiYXInOlxuICAgIGNhc2UgJ3RpY2snOlxuICAgICAgaWYgKGNvbmZpZy5zY2FsZS5tYXhCYW5kU2l6ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVybiBjb25maWcuc2NhbGUubWF4QmFuZFNpemU7XG4gICAgICB9XG4gICAgICByZXR1cm4gbWluWFlSYW5nZVN0ZXAoeHlSYW5nZVN0ZXBzLCBjb25maWcuc2NhbGUpIC0gMTtcbiAgICBjYXNlICdsaW5lJzpcbiAgICBjYXNlICd0cmFpbCc6XG4gICAgY2FzZSAncnVsZSc6XG4gICAgICByZXR1cm4gY29uZmlnLnNjYWxlLm1heFN0cm9rZVdpZHRoO1xuICAgIGNhc2UgJ3RleHQnOlxuICAgICAgcmV0dXJuIGNvbmZpZy5zY2FsZS5tYXhGb250U2l6ZTtcbiAgICBjYXNlICdwb2ludCc6XG4gICAgY2FzZSAnc3F1YXJlJzpcbiAgICBjYXNlICdjaXJjbGUnOlxuICAgICAgaWYgKGNvbmZpZy5zY2FsZS5tYXhTaXplKSB7XG4gICAgICAgIHJldHVybiBjb25maWcuc2NhbGUubWF4U2l6ZTtcbiAgICAgIH1cblxuICAgICAgLy8gRklYTUUgdGhpcyBjYXNlIHRvdGFsbHkgc2hvdWxkIGJlIHJlZmFjdG9yZWRcbiAgICAgIGNvbnN0IHBvaW50U3RlcCA9IG1pblhZUmFuZ2VTdGVwKHh5UmFuZ2VTdGVwcywgc2NhbGVDb25maWcpO1xuICAgICAgcmV0dXJuIChwb2ludFN0ZXAgLSAyKSAqIChwb2ludFN0ZXAgLSAyKTtcbiAgfVxuICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogc2hvdWxkIG5ldmVyIHJlYWNoIGhlcmUgKi9cbiAgLy8gc2l6ZVJhbmdlTWF4IG5vdCBpbXBsZW1lbnRlZCBmb3IgdGhlIG1hcmtcbiAgdGhyb3cgbmV3IEVycm9yKGxvZy5tZXNzYWdlLmluY29tcGF0aWJsZUNoYW5uZWwoJ3NpemUnLCBtYXJrKSk7XG59XG5cbi8qKlxuICogQHJldHVybnMge251bWJlcn0gUmFuZ2Ugc3RlcCBvZiB4IG9yIHkgb3IgbWluaW11bSBiZXR3ZWVuIHRoZSB0d28gaWYgYm90aCBhcmUgb3JkaW5hbCBzY2FsZS5cbiAqL1xuZnVuY3Rpb24gbWluWFlSYW5nZVN0ZXAoeHlSYW5nZVN0ZXBzOiBudW1iZXJbXSwgc2NhbGVDb25maWc6IFNjYWxlQ29uZmlnKTogbnVtYmVyIHtcbiAgaWYgKHh5UmFuZ2VTdGVwcy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIE1hdGgubWluLmFwcGx5KG51bGwsIHh5UmFuZ2VTdGVwcyk7XG4gIH1cbiAgaWYgKHNjYWxlQ29uZmlnLnJhbmdlU3RlcCkge1xuICAgIHJldHVybiBzY2FsZUNvbmZpZy5yYW5nZVN0ZXA7XG4gIH1cbiAgcmV0dXJuIDIxOyAvLyBGSVhNRTogcmUtZXZhbHVhdGUgdGhlIGRlZmF1bHQgdmFsdWUgaGVyZS5cbn1cbiJdfQ==