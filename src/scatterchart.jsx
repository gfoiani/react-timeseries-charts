/**
 *  Copyright (c) 2015, The Regents of the University of California,
 *  through Lawrence Berkeley National Laboratory (subject to receipt
 *  of any required approvals from the U.S. Dept. of Energy).
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree.
 */

import React from "react";
import ReactDOM from "react-dom";
import d3 from "d3";
import _ from "underscore";

import { TimeSeries } from "pondjs";

import "./scatterchart.css";

function scaleAsString(scale) {
    return `${scale.domain()}-${scale.range()}`;
}

/**
 * The `<ScatterChart >` widget is able to display a single series
 * scattered across a time axis.
 *
 * The ScatterChart should be used within `<ChartContainer>` etc.,
 * as this will construct the horizontal and vertical axis, and
 * manage other elements.
 *
 *
 * ```
 * <ChartContainer timeRange={series.timerange()}>
 *     <ChartRow height="150">
 *         <YAxis id="wind" label="Wind gust (mph)" labelOffset={-5}
 *                min={0} max={series.max()} width="100" type="linear" format=",.1f"/>
 *         <Charts>
 *             <ScatterChart axis="wind" series={series} style={{color: "steelblue", opacity: 0.5}} />
 *         </Charts>
 *     </ChartRow>
 * </ChartContainer>
 * ```
 */
export default React.createClass({

    displayName: "ScatterChart",

    getDefaultProps() {
        return {
            radius: 2.0,
            style: {
                color: "steelblue",
                opacity: 1
            }
        };
    },

    propTypes: {

        /**
         * What [Pond TimeSeries](http://software.es.net/pond#timeseries) data to visualize
         */
        series: React.PropTypes.instanceOf(TimeSeries).isRequired,

        /**
         * Reference to the axis which provides the vertical scale for drawing. e.g.
         * specifying axis="trafficRate" would refer the y-scale to the YAxis of id="trafficRate".
         */
        axis: React.PropTypes.string.isRequired,

        /**
         * The radius of each point if a radius is not present in the series.
         */
        radius: React.PropTypes.number,

        /**
         * The style of the scatter chart drawing (using SVG CSS properties). For example:
         * ```
         * style = {
         *     color: "steelblue",
         *     opacity: 0.5
         * }
         * ```
         */
        style: React.PropTypes.shape({
            color: React.PropTypes.string,
            opacity: React.PropTypes.number
        })

    },

    renderScatterChart(series, timeScale, yScale, radius) {

        let data = series.toJSON().points;

        if (!yScale || !data[0]) {
            return null;
        }

        if (this.props.dropNulls) {
            data = _.filter(data, d => (d.value !== null) );
        }

        const style = {
            fill: this.props.style.color || "steelblue",
            fillOpacity: this.props.style.opacity || 1.0,
            stroke: "none"
        };

        d3.select(ReactDOM.findDOMNode(this)).selectAll("*").remove();

        this.scatter = d3.select(ReactDOM.findDOMNode(this)).selectAll("dot")
                .data(data)
            .enter().append("circle")
                .style(style)
                .attr("r", d => d[2] ? d[2] : radius)
                .attr("cx", d => timeScale(d[0]))
                .attr("cy", d => yScale(d[1]))
                .attr("clip-path",this.props.clipPathURL);
    },

    updateScatterChart(series, timeScale, yScale, radius) {
        const data = series.toJSON().points;
        this.scatter
            .data(data)
            .transition()
                .duration(this.props.transiton)
                .ease("sin-in-out")
                .attr("r", d => d[2] ? d[2] : radius)
                .attr("cx", d => timeScale(d[0]))
                .attr("cy", d => yScale(d[1]));
    },

    componentDidMount() {
        this.renderScatterChart(this.props.series,
                                this.props.timeScale,
                                this.props.yScale,
                                this.props.radius,
                                this.props.classed);

    },

    componentWillReceiveProps(nextProps) {
        const series = nextProps.series;
        const timeScale = nextProps.timeScale;
        const yScale = nextProps.yScale;
        const radius = nextProps.radius;

        // What changed
        const timeScaleChanged =
            (scaleAsString(this.props.timeScale) !== scaleAsString(timeScale));
        const yAxisScaleChanged =
            (scaleAsString(this.props.yScale) !== scaleAsString(yScale));
        const defaultRadiusChanged = (this.props.radius !== radius);
        const seriesChanged = TimeSeries.is(this.props.series, series);

        //
        // Currently if the series changes we completely rerender it.
        // If the y axis scale changes then we just update the existing
        // paths using a transition so that we can get smooth axis transitions.
        //

        if (seriesChanged || timeScaleChanged || defaultRadiusChanged) {
            this.renderScatterChart(series, timeScale, yScale, radius);
        } else if (yAxisScaleChanged) {
            this.updateScatterChart(series, timeScale, yScale, radius);
        }

    },

    shouldComponentUpdate() {
        return false;
    },

    render() {
        return (
            <g></g>
        );
    }
});
