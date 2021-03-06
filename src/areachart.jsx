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

//Pond
import { TimeSeries } from "pondjs";

function scaleAsString(scale) {
    return `${scale.domain()}-${scale.range()}`;
}

/**
 * Build up our data from the series. For each layer in the up (or down)
 * direction, layer, we have layer.values = [points] where each point is
 * in the format {data: .., value, ..}
 */
function getLayers(columns, series) {
    const up = columns.up || [];
    const down = columns.down || [];
    return {
        upLayers: up.map(columnName => {
            const points = [];
            for (let i = 0; i < series.size(); i++) {
                const point = series.at(i);
                points.push({
                    date: point.timestamp(),
                    value: point.get(columnName)
                });
            }
            return {values: points};
        }),

        downLayers: down.map(columnName => {
            const points = [];
            for (let i = 0; i < series.size(); i++) {
                const point = series.at(i);
                points.push({
                    date: point.timestamp(),
                    value: point.get(columnName)
                });
            }
            return {values: points};
        })
    };
}

/**
 * Build a D3 area generator based on the interpolate method and the supplied
 * timeScale and yScale. The result is an SVG area.
 *
 *   y|    |||  +y1   ||||||
 *    |||||||||||||||||||||||||
 *    | |||     +y0      |||||||||<-area
 *    |
 *    +---------|---------------- t
 *              x
 */
function getAreaGenerators(interpolate, timeScale, yScale) {
    const upArea = d3.svg.area()
        .x(d => timeScale(d.date))
        .y0(d => yScale(d.y0))
        .y1(d => yScale(d.y0 + d.value))
        .interpolate(interpolate);

    const downArea = d3.svg.area()
        .x(d => timeScale(d.date))
        .y0(d => yScale(d.y0))
        .y1(d => yScale(d.y0 - d.value))
        .interpolate(interpolate);

    return {upArea, downArea};
}

/**
 * Our D3 stack. When this is evoked with data (an array of layers) it builds up
 * the stack of graphs on top of each other (i.e propogates a baseline y
 * position up through the stack).
 */
function getAreaStackers() {
    return {
        stackUp:
            d3.layout.stack()
                .values(d => d.values)
                    .x(d => d.date)
                    .y(d => d.value),

        stackDown:
            d3.layout.stack()
                .values(d => d.values)
                    .x(d => d.date)
                    .y(d => -d.value)
    };
}

function getCroppedSeries(scale, width, series) {
    const beginTime = scale.invert(0);
    const endTime = scale.invert(width);
    const beginIndex = series.bisect(beginTime);
    const endIndex = series.bisect(endTime);
    return series.slice(beginIndex,
                        endIndex === series.size() - 1 ?
                            endIndex : endIndex + 1);
}

/**
 * The AreaChart widget is able to display single or multiple stacked
 * areas above or below the axis. It used throughout the
 * [My ESnet Portal](http://my.es.net).

 * The AreaChart should be used within a `<ChartContainer>` structure,
 * as this will construct the horizontal and vertical axis, and manage
 * other elements. Here is an example of an AreaChart with an up and down
 * traffic visualization:
 *
 *  ```
 *   render() {
 *      return (
 *          ...
 *          <ChartContainer timeRange={trafficSeries.timerange()} width="1080">
 *              <ChartRow height="150">
 *                  <Charts>
 *                      <AreaChart
 *                          axis="traffic"
 *                          series={trafficSeries}
 *                          columns={{up: ["in"], down: ["out"]}}/>
 *                  </Charts>
 *                  <YAxis id="traffic" label="Traffic (bps)" min={-max} max={max} absolute={true} width="60" type="linear"/>
 *              </ChartRow>
 *          </ChartContainer>
 *          ...
 *      );
 *  }
 *  ```
 * The `<AreaChart>`` takes a single `TimeSeries` object into its `series` prop. This
 * series can contain multiple columns and those columns can be referenced using the `columns`
 * prop. The `columns` props allows you to map columns in the series to the chart,
 * letting you specify the stacking and orientation of the data. In the above example
 * we map the "in" column in `trafficSeries` to the up direction and the "out" column to
 * the down direction. Each direction is specified as an array, so adding multiple
 * columns into a direction will stack the areas in that direction.
 *
 * Note: It is recommended that `<ChartContainer>`s be placed within a <Resizable> tag,
 * rather than hard coding the width as in the above example.
 */
export default React.createClass({

    displayName: "AreaChart",

    propTypes: {

        /**
         * What [Pond TimeSeries](http://software.es.net/pond#timeseries) data to visualize
         */
        series: React.PropTypes.instanceOf(TimeSeries).isRequired,

        /**
         * Reference to the axis which provides the vertical scale for ## drawing. e.g.
         * specifying axis="trafficRate" would refer the y-scale to the YAxis of id="trafficRate".
         */
        axis: React.PropTypes.string.isRequired,

        /**
         * The series series columns mapped to stacking up and down.
         * Has the format:
         * ```
         *  "columns": {
         *      up: ["in", ...],
         *      down: ["out", ...]
         *  }
         *  ```
         */
        columns: React.PropTypes.shape({
            up: React.PropTypes.arrayOf(React.PropTypes.string),
            down: React.PropTypes.arrayOf(React.PropTypes.string)
        }),

        /**
         * The style of the area chart, with format:
         * ```
         * "style": {
         *     up: ["#448FDD", "#75ACE6", "#A9CBEF", ...],
         *     down: ["#FD8D0D", "#FDA949", "#FEC686", ...]
         * }
         * ```
         * Where each color in the array corresponds to each area stacked
         * either up or down.
         */
        style: React.PropTypes.shape({
            up: React.PropTypes.arrayOf(React.PropTypes.string),
            down: React.PropTypes.arrayOf(React.PropTypes.string)
        }),

        /**
         * The d3 interpolation method
         */
        interpolate: React.PropTypes.string
    },

    getDefaultProps() {
        return {
            transition: 0,
            interpolate: "step-after",
            style: {
                up: ["#448FDD", "#75ACE6", "#A9CBEF"],
                down: ["#FD8D0D", "#FDA949", "#FEC686"]
            },
            columns: {
                up: ["value"],
                down: []
            }
        };
    },

    /**
     * Checks if the passed in point is within the bounds of the drawing area
     */
    inBounds(p) {
        return p[0] > 0 && p[0] < this.props.width;
    },

    renderAreaChart(series, timeScale, yScale, interpolate, isPanning, columns, width) {
        if (!yScale) {
            return null;
        }

        d3.select(ReactDOM.findDOMNode(this)).selectAll("*").remove();

        const croppedSeries = getCroppedSeries(timeScale,
                                               width,
                                               series);

        const {upArea, downArea} = getAreaGenerators(interpolate,
                                                     timeScale,
                                                     yScale);
        const {upLayers, downLayers} = getLayers(columns,
                                                 croppedSeries);

        const {stackUp, stackDown} = getAreaStackers();

        // Stack our layers
        stackUp(upLayers);
        if (downLayers.length) {
            stackDown(downLayers);
        }

        // Cursor
        const cursor = isPanning ? "-webkit-grabbing" : "default";

        //
        // Stacked area drawing up
        //

        // Make a group 'areachart-up-group' for each stacked area
        const upChart = d3.select(ReactDOM.findDOMNode(this))
            .selectAll(".areachart-up-group")
                .data(upLayers)
            .enter().append("g")
                .attr("id", () => _.uniqueId("areachart-up-"));

        // Append the area chart path onto the areachart-up-group group
        this.upChart = upChart
            .append("path")
                .style("fill", (d, i) => this.props.style.up[i])
                .style("pointerEvents", "none")
                .style("cursor", cursor)
                .attr("d", d => upArea(d.values))
                .attr("clip-path", this.props.clipPathURL);

        //
        // Stacked area drawing down
        //

        // Make a group 'areachart-down-group' for each stacked area
        const downChart = d3.select(ReactDOM.findDOMNode(this))
          .selectAll(".areachart-down-group")
            .data(downLayers)
          .enter().append("g")
            .attr("id", () => _.uniqueId("areachart-down-"));

        // Append the area chart path onto the areachart-down-group group
        this.downChart = downChart
            .append("path")
                .style("fill", (d, i) => this.props.style.down[i])
                .style("pointerEvents", "none")
                .style("cursor", cursor)
                .attr("d", d => downArea(d.values))
                .attr("clip-path", this.props.clipPathURL);

    },

    updateAreaChart(series, timeScale, yScale, interpolate, columns, width) {
        const croppedSeries = getCroppedSeries(timeScale,
                                               width,
                                               series);
        const {upArea, downArea} = getAreaGenerators(interpolate,
                                                     timeScale,
                                                     yScale);
        const {upLayers, downLayers} = getLayers(columns,
                                                 croppedSeries);
        const {stackUp, stackDown} = getAreaStackers();

        // Stack our layers
        stackUp(upLayers);
        if (downLayers.length) {
            stackDown(downLayers);
        }

        this.upChart
            .transition()
            .duration(this.props.transition)
            .ease("sin-in-out")
            .attr("d", d => upArea(d.values));

        this.downChart
            .transition()
            .duration(this.props.transition)
            .ease("sin-in-out")
            .attr("d", d => downArea(d.values));

    },

    componentDidMount() {
        this.renderAreaChart(this.props.series,
                             this.props.timeScale,
                             this.props.yScale,
                             this.props.interpolate,
                             this.props.isPanning,
                             this.props.columns);
    },

    componentWillReceiveProps(nextProps) {
        const newSeries = nextProps.series;
        const oldSeries = this.props.series;

        const width = nextProps.width;
        const timeScale = nextProps.timeScale;
        const yScale = nextProps.yScale;
        const interpolate = nextProps.interpolate;
        const isPanning = nextProps.isPanning;
        const columns = nextProps.columns;

        // What changed?
        const widthChanged =
            (this.props.width !== width);
        const timeScaleChanged =
            (scaleAsString(this.props.timeScale) !== scaleAsString(timeScale));
        const yAxisScaleChanged =
            (scaleAsString(this.props.yScale) !== scaleAsString(yScale));
        const interpolateChanged =
            (this.props.interpolate !== interpolate);
        const isPanningChanged =
            (this.props.isPanning !== isPanning);
        const columnsChanged =
            (JSON.stringify(this.props.columns) !== JSON.stringify(columns));

        let seriesChanged = false;
        if (oldSeries.length !== newSeries.length) {
            seriesChanged = true;
        } else {
            seriesChanged = !TimeSeries.is(oldSeries, newSeries);
        }

        //
        // Currently if the series changes we completely rerender it. If the
        // y axis scale changes then we just update the existing paths using a
        // transition so that we can get smooth axis transitions.
        //

        if (seriesChanged || timeScaleChanged || widthChanged ||
            interpolateChanged || isPanningChanged || columnsChanged) {
            this.renderAreaChart(newSeries, timeScale,
                                 yScale, interpolate,
                                 isPanning, columns, width);
        } else if (yAxisScaleChanged) {
            this.updateAreaChart(newSeries, timeScale,
                                 yScale, interpolate, columns, width);
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
