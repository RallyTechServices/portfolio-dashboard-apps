Ext.define( 'Rally.technicalservices.gridboard.Gridboard', {
    extend: 'Rally.ui.gridboard.GridBoard',
    alias: 'widget.tsgridboard',
    cls: 'rui-gridboard',
    items: [
        {
            itemId: 'header',
            xtype: 'rallyleftright',
            padding: '4 10',
            overflowX: 'hidden'
        }
    ]
});