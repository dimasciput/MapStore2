const React = require('react');
const {Button, Glyphicon} = require('react-bootstrap');
const hideStyle = {
    width: 0,
    padding: 0,
    borderWidth: 0
};
const normalStyle = {};
const getStyle = (visible) => visible ? normalStyle : hideStyle;

module.exports = class SimpleTButton extends React.Component {
    render() {
        const {disabled, id, visible, onClick, glyph, active, loading = false, className = "square-button", ...props} = this.props;
        return (<Button {...props} bsStyle={active ? "success" : "primary"} disabled={disabled} id={`fg-${id}`}
            style={getStyle(visible)}
            className={className}
            onClick={() => !disabled && onClick()}>
            {loading ? <div className="toc-inline-loader"></div> : <Glyphicon glyph={glyph}/>}
        </Button>);
    }
};
