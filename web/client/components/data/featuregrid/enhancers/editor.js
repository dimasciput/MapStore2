const {featureTypeToGridColumns, getToolColumns, getRow, getRowVirtual, getGridEvents, applyAllChanges, createNewAndEditingFilter} = require('../../../../utils/FeatureGridUtils');
const EditorRegistry = require('../../../../utils/featuregrid/EditorRegistry');
const ConfigUtils = require('../../../../utils/ConfigUtils');
const {compose, withPropsOnChange, withHandlers, defaultProps, createEventHandler} = require('recompose');
const {isNil} = require('lodash');
const React = require('react');
const {getFilterRenderer} = require('../filterRenderers');
const {getFormatter} = require('../formatters');
const {manageFilterRendererState} = require('../enhancers/filterRenderers');

const propsStreamFactory = require('../../../misc/enhancers/propsStreamFactory');

class HTMLCellFormatter extends React.Component {
    render() {
        return <div dangerouslySetInnerHTML={{ __html: this.props.value }} />;
    }
}

const editors = require('../editors');
const {getRowIdx} = require('../../../../utils/FeatureGridUtils');
const loadMoreFeaturesStream = $props => {
    return $props
        .distinctUntilChanged(({features: oF, pages: oPages, isFocused: oFocused}, {features: nF, pages: nPages, isFocused: nFocused}) => oF === nF && oFocused === nFocused && oPages === nPages)
        .switchMap(({size, pageEvents, isFocused, pages, pagination, vsOverScan = 20, scrollDebounce = 50, onGridScroll$}) => {
            return onGridScroll$
                .debounceTime(scrollDebounce)
                .filter(() => !isFocused)
                .map(({firstRowIdx, lastRowIdx}) => {
                    const fr = firstRowIdx - vsOverScan < 0 ? 0 : firstRowIdx - vsOverScan;
                    const lr = lastRowIdx + vsOverScan > pagination.totalFeatures - 1 ? pagination.totalFeatures - 1 : lastRowIdx + vsOverScan;
                    const startPage = Math.floor(fr / size);
                    const endPage = Math.floor(lr / size);
                    let shouldLoad = false;
                    for (let i = startPage; i <= endPage && !shouldLoad; i++) {
                        if (getRowIdx(i * size, pages, size) === -1) {
                            shouldLoad = true;
                        }
                    }
                    return shouldLoad && {startPage, endPage};
                })
                .filter((l) => l)
                .do((p) => pageEvents.moreFeatures(p));
        });
};

const dataStreamFactory = $props => {
    const {handler: onGridScroll, stream: onGridScroll$} = createEventHandler();
    const $p = $props
        .filter(({virtualScroll}) => virtualScroll).map(o => ({...o, onGridScroll$ }));
    return loadMoreFeaturesStream($p).startWith({}).map( o => ({...o, onGridScroll}));
};

const featuresToGrid = compose(
    defaultProps({
        sortable: true,
        autocompleteEnabled: false,
        initPlugin: () => {},
        url: "",
        typeName: "",
        enableColumnFilters: false,
        columns: [],
        features: [],
        newFeatures: [],
        select: [],
        changes: {},
        focusOnEdit: true,
        editors,
        dataStreamFactory,
        virtualScroll: true
    }),
    withPropsOnChange("showDragHandle", ({showDragHandle = false} = {}) => ({
        className: showDragHandle ? 'feature-grid-drag-handle-show' : 'feature-grid-drag-handle-hide'
    })),
    withPropsOnChange(
        ["enableColumnFilters"],
        props => ({displayFilters: props.enableColumnFilters})
    ),
    withPropsOnChange(
        ["editingAllowedRoles", "virtualScroll"],
        props => ({
            editingAllowedRoles: props.editingAllowedRoles,
            initPlugin: props.initPlugin
        })
    ),
    withPropsOnChange(
        ["autocompleteEnabled"],
        props => ({autocompleteEnabled: props.autocompleteEnabled})
    ),
    withPropsOnChange(
        ["url"],
        props => ({url: props.url})
    ),
    withPropsOnChange(
        ["typeName"],
        props => ({typeName: props.typeName})
    ),
    withPropsOnChange(
        ["features", "newFeatures", "changes"],
        props => {
            const rowsResult = ({
                rows: (props.newFeatures ? [...props.newFeatures, ...props.features] : props.features)
                    .filter(props.focusOnEdit ? createNewAndEditingFilter(props.changes && Object.keys(props.changes).length > 0, props.newFeatures, props.changes) : () => true)
                    .map(orig => applyAllChanges(orig, props.changes)).map(result =>
                        ({...result,
                            get: key => {
                                return (key === "id" || key === "geometry" || key === "_new") ? result[key] : result.properties && result.properties[key];
                            }
                        }))
            });
            return rowsResult;
        }),
    withPropsOnChange(
        ["newFeatures", "changes", "focusOnEdit"],
        props => ({
            isFocused: props.focusOnEdit && (props.changes && Object.keys(props.changes).length > 0 || props.newFeatures && props.newFeatures.length > 0 )
        })
    ),
    withPropsOnChange(
        ["features", "newFeatures", "isFocused", "virtualScroll"],
        props => ({
            rowsCount: ( props.isFocused || !props.virtualScroll) && props.rows && props.rows.length || (props.pagination && props.pagination.totalFeatures) || 0
        })
    ),
    withHandlers({rowGetter: props => props.virtualScroll && (i => getRowVirtual(i, props.rows, props.pages, props.size)) || (i => getRow(i, props.rows))}),
    withPropsOnChange(
        ["describeFeatureType", "columnSettings", "tools", "actionOpts", "mode", "isFocused", "sortable"],
        props => {
            const getFilterRendererFunc = ({localType = ""} = {}, name) => {
                if (props.filterRenderers && props.filterRenderers[name]) {
                    return props.filterRenderers[name];
                }
                return manageFilterRendererState(getFilterRenderer(localType));
            };

            const result = ({
                columns: getToolColumns(props.tools, props.rowGetter, props.describeFeatureType, props.actionOpts, getFilterRendererFunc)
                    .concat(featureTypeToGridColumns(props.describeFeatureType, props.columnSettings, {
                        editable: props.mode === "EDIT",
                        sortable: props.sortable && !props.isFocused,
                        defaultSize: props.defaultSize
                    }, {
                        getEditor: (desc) => {
                            const generalProps = {
                                onTemporaryChanges: props.gridEvents && props.gridEvents.onTemporaryChanges,
                                autocompleteEnabled: props.autocompleteEnabled,
                                url: props.url,
                                typeName: props.typeName
                            };
                            const regexProps = {attribute: desc.name, url: props.url, typeName: props.typeName};
                            const rules = props.customEditorsOptions && props.customEditorsOptions.rules || [];
                            const editorProps = {type: desc.localType, generalProps, props};
                            const editor = EditorRegistry.getCustomEditor(regexProps, rules, editorProps);

                            if (!isNil(editor)) {
                                return editor;
                            }
                            return props.editors(desc.localType, generalProps);
                        },
                        getFilterRenderer: getFilterRendererFunc,
                        getFormatter: (desc) => getFormatter(desc)
                    }))
            });
            let layerAttributes = ConfigUtils.getConfigProp('layerattributes');
            if (props.typeName) {
                try {
                    let _layerAttributes = layerAttributes[props.typeName];
                    if (_layerAttributes) {
                        _layerAttributes.forEach((_attribute, index) => {
                            result.columns.forEach((_column, columnIndex) => {
                                if (_column.name === _attribute.attribute) {
                                    if (!_attribute.visible) {
                                        // Remove column
                                        result.columns.splice(columnIndex, 1);
                                    } else {
                                        result.columns[columnIndex].name = _attribute.attribute_label;
                                        result.columns[columnIndex].order = _attribute.display_order;
                                        result.columns[columnIndex].attribute_type = _attribute.attribute_type;
                                        if (_attribute.attribute_type === 'html') {
                                            result.columns[columnIndex].formatter = HTMLCellFormatter;
                                        }
                                    }
                                } else if (_column.name === '') {
                                    result.columns.splice(columnIndex, 1);
                                }
                            });
                        });
                        result.columns.sort((a, b) => (a.order > b.order) ? 1 : -1);
                    }
                } catch (e) {
                }
            }
            console.log('COLUMNS', result);
            return result;
        }
    ),
    withPropsOnChange(
        ["gridOpts", "describeFeatureType", "actionOpts", "mode", "select", "columns"],
        props => {
            // bind proper events and setup the columns array
            // bind and get proper grid events from gridEvents object
            let {
                onRowsSelected = () => {},
                onRowsDeselected = () => {},
                onRowsToggled = () => {},
                ...gridEvents} = getGridEvents(props.gridEvents, props.rowGetter, props.describeFeatureType, props.actionOpts, props.columns);

            // setup gridOpts setting app selection events bind
            let gridOpts = props.gridOpts;
            gridOpts = {
                ...gridOpts,
                enableCellSelect: props.mode === "EDIT",
                rowSelection: {
                    showCheckbox: props.mode === "EDIT",
                    selectBy: {
                        keys: {
                            rowKey: 'id',
                            values: props.select.map(f => f.id)
                        }
                    },
                    onRowsSelected,
                    onRowsDeselected
                }
            };

            // set selection by row click if checkbox are not present is enabled
            gridEvents.onRowClick = (rowIdx, row) => {
                if (rowIdx >= 0) {
                    onRowsToggled([{rowIdx, row}]);
                }
            };
            return {
                ...gridEvents,
                ...gridOpts
            };
        }
    ),
    propsStreamFactory
);
module.exports = {
    featuresToGrid
};
