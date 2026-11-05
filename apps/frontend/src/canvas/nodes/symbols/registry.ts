import type { SymbolDrawing } from "../symbol-drawing";

import absDrawing from "./abs";
import ammeterDrawing from "./ammeter";
import bjtNpnDrawing from "./bjtNpn";
import bjtPnpDrawing from "./bjtPnp";
import comparatorDrawing from "./comparator";
import controlledCurrentSourceDrawing from "./controlledCurrentSource";
import controlledVoltageSourceDrawing from "./controlledVoltageSource";
import coupledInductorDrawing from "./coupledInductor";
import deadbandDrawing from "./deadband";
import dependentCccsDrawing from "./dependentCccs";
import dependentCcvsDrawing from "./dependentCcvs";
import dependentVccsDrawing from "./dependentVccs";
import dependentVcvsDrawing from "./dependentVcvs";
import derivativeDrawing from "./derivative";
import { converterDrawing } from "./domainConverter";
import gainDrawing from "./gain";
import genericSwitchDrawing from "./genericSwitch";
import idealSwitchDrawing from "./idealSwitch";
import integratorDrawing from "./integrator";
import jfetNDrawing from "./jfetN";
import jfetPDrawing from "./jfetP";
import ledDrawing from "./led";
import mathFunctionDrawing from "./mathFunction";
import memristorDrawing from "./memristor";
import minMaxDrawing from "./minMax";
import mosfetNDrawing from "./mosfetN";
import mosfetPDrawing from "./mosfetP";
import opampDrawing from "./opamp";
import productDrawing from "./product";
import quantizerDrawing from "./quantizer";
import rateLimiterDrawing from "./rateLimiter";
import resistorDrawing from "./resistor";
import { fromDrawing, gotoDrawing } from "./routingTag";
import saturationDrawing from "./saturation";
import signDrawing from "./sign";
import sumDrawing from "./sum";
import thyristorDrawing from "./thyristor";
import tlineLosslessDrawing from "./tlineLossless";
import transferFunctionDrawing from "./transferFunction";
import transformerDrawing from "./transformer";
import unitDelayDrawing from "./unitDelay";
import voltageSensorDrawing from "./voltageSensor";
import zenerDrawing from "./zener";
import zeroOrderHoldDrawing from "./zeroOrderHold";

/**
 * Which artwork draws which catalog types.
 *
 * This is the whole seam. A new or replaced drawing is one file in this
 * directory plus one entry here; nothing about what a component *is* —
 * ports, bbox, parameters, what it compiles to — lives on this side, so
 * swapping artwork cannot change behaviour.
 *
 * A type may appear once. Several types sharing one drawing is normal: the
 * catalog carries both a short and a namespaced spelling of most electrical
 * parts, and they are the same component.
 */
export const SYMBOL_DRAWINGS: Record<string, SymbolDrawing> = {
  // ── Transistors ──────────────────────────────────────────────────────────
  "semi.mosfet.n": mosfetNDrawing,
  "physical_electrical.semiconductor.mosfet_n": mosfetNDrawing,
  "semi.mosfet.vdmos": mosfetNDrawing,
  "semi.mosfet.p": mosfetPDrawing,
  "physical_electrical.semiconductor.mosfet_p": mosfetPDrawing,
  "semi.bjt.npn": bjtNpnDrawing,
  "physical_electrical.semiconductor.bjt_npn": bjtNpnDrawing,
  "semi.bjt.pnp": bjtPnpDrawing,
  "physical_electrical.semiconductor.bjt_pnp": bjtPnpDrawing,
  "semi.jfet.n": jfetNDrawing,
  "semi.jfet.p": jfetPDrawing,

  // ── Switches ─────────────────────────────────────────────────────────────
  "passive.switch.ideal": idealSwitchDrawing,
  "passive.switch.generic": genericSwitchDrawing,

  // ── Magnetics ────────────────────────────────────────────────────────────
  "physical_electrical.passive.transformer": transformerDrawing,
  "physical_electrical.passive.mutual_inductor": transformerDrawing,
  "passive.inductor.coupled": coupledInductorDrawing,

  // ── Diodes and two-terminal specials ─────────────────────────────────────
  "semi.diode.zener": zenerDrawing,
  "physical_electrical.semiconductor.zener": zenerDrawing,
  "physical_electrical.semiconductor.led": ledDrawing,
  "physical_electrical.semiconductor.thyristor": thyristorDrawing,
  "passive.memristor": memristorDrawing,
  "physical_electrical.passive.memristor": memristorDrawing,
  "physical_electrical.sensor.voltage": voltageSensorDrawing,
  "physical_electrical.tline.lossless": tlineLosslessDrawing,
  "physical_electrical.tline.lossy": tlineLosslessDrawing,
  // IEC 60617 corrections. The resistor was an ANSI/IEEE zigzag — the US
  // convention, as the file it came from said in its own comment — and the
  // current sensor was a circle containing an arrow, which is the symbol
  // for a current *source*: the instrument and the thing it measures drew
  // identically.
  "passive.resistor": resistorDrawing,
  "physical_electrical.passive.resistor": resistorDrawing,
  "physical_electrical.sensor.current": ammeterDrawing,

  // The Goto/From pair, which lets a sheet carry a signal without drawing a
  // wire across it. Both were blank rectangles, which defeats the point:
  // the value of a tag is reading where the signal goes without following
  // a line, and a tag you cannot read is not a tag.
  "routing.goto": gotoDrawing,
  "routing.from": fromDrawing,

  // Domain converters. Every one of these fell back to a blank rectangle,
  // so eleven different parts drew identically; the symbol now carries the
  // boundary it exists to cross.
  "converter.sig2phys": converterDrawing("signal", "physical-electrical", 60),
  "converter.phys2sig": converterDrawing("physical-electrical", "signal", 60),
  "converter.signal_to_physical_signal": converterDrawing("signal", "physical-signal"),
  "converter.physical_signal_to_signal": converterDrawing("physical-signal", "signal"),
  "converter.electrical_to_rotational": converterDrawing(
    "physical-electrical",
    "physical-rotational",
  ),
  "converter.rotational_to_electrical": converterDrawing(
    "physical-rotational",
    "physical-electrical",
  ),
  "converter.electrical_to_thermal": converterDrawing("physical-electrical", "physical-thermal"),
  "converter.electrical_to_translational": converterDrawing(
    "physical-electrical",
    "physical-translational",
  ),
  "converter.translational_to_electrical": converterDrawing(
    "physical-translational",
    "physical-electrical",
  ),
  "converter.rotational_to_translational": converterDrawing(
    "physical-rotational",
    "physical-translational",
  ),
  "converter.translational_to_rotational": converterDrawing(
    "physical-translational",
    "physical-rotational",
  ),

  // The engine-compilable dependent family. gsim-core builds a true ideal
  // transformer out of the VCVS/CCCS pair, so these are drawn, not generic.
  "source.dependent.vcvs": dependentVcvsDrawing,
  "source.dependent.vccs": dependentVccsDrawing,
  "source.dependent.ccvs": dependentCcvsDrawing,
  "source.dependent.cccs": dependentCccsDrawing,
  "physical_electrical.source.controlled_voltage": controlledVoltageSourceDrawing,
  "physical_electrical.source.controlled_current": controlledCurrentSourceDrawing,

  // ── Op-amps ──────────────────────────────────────────────────────────────
  "physical_electrical.opamp.ideal": opampDrawing,
  "physical_electrical.opamp.finite_gain": opampDrawing,
  "physical_electrical.opamp.band_limited": opampDrawing,
  "physical_electrical.opamp.comparator": opampDrawing,

  // ── Signal-flow / control ────────────────────────────────────────────────
  "control.gain": gainDrawing,
  "signal_flow.math.gain": gainDrawing,
  "control.integrator": integratorDrawing,
  "control.derivative": derivativeDrawing,
  "control.saturation": saturationDrawing,
  "control.deadband": deadbandDrawing,
  "control.rate_limiter": rateLimiterDrawing,
  "control.transfer_function": transferFunctionDrawing,
  "control.discrete_transfer_function": transferFunctionDrawing,
  "control.sum": sumDrawing,
  "signal_flow.math.sum": sumDrawing,
  "control.product": productDrawing,
  "signal_flow.math.product": productDrawing,
  "control.delay": unitDelayDrawing,
  "control.zero_order_hold": zeroOrderHoldDrawing,
  "control.quantizer": quantizerDrawing,
  "signal_flow.math.abs": absDrawing,
  "signal_flow.math.sign": signDrawing,
  "signal_flow.math.min_max": minMaxDrawing,
  "math.fn1": mathFunctionDrawing,
  "math.fn2": mathFunctionDrawing,
  "math.fn3": mathFunctionDrawing,
  "logic.comparator": comparatorDrawing,
};

/** The artwork for a catalog type, if this directory supplies one. */
export function findDrawing(...names: Array<string | undefined>): SymbolDrawing | undefined {
  for (const name of names) {
    if (name && SYMBOL_DRAWINGS[name]) {
      return SYMBOL_DRAWINGS[name];
    }
  }
  return undefined;
}
