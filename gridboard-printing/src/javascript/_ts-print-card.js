Ext.define('Rally.technicalservices.window.PrintCards',{    extend: 'Ext.Window',
    logger: new Rally.technicalservices.Logger(),
    truncateText: '...',
    config: {
        title: 'print...',
        records: null,
        styleSheetTitle: "printCards", 
        /**
         *  Array of the following:
         *  dataIndex
         *  maxLength (default 0)
         *  cls (defaults are: card-title, content, 
         */
        displayFields: null 
    },
    constructor: function(config){
        this.initConfig(config);
    },
    show: function(){
        var options = "toolbar=1,menubar=1,scrollbars=yes,scrolling=yes,resizable=yes,width=1000,height=500";
        var win = window.open('',this.title);
        
        var html = this._buildCardsHTML();
        
        win.document.write('<html><head><title>' + this.title + '</title>');
        win.document.write('<style>');
        win.document.write(this._getStyleSheet(this.styleSheetTitle));
        win.document.write('</style>');
        win.document.write('</head><body class="landscape">');
        win.document.write(html);
        win.document.write('</body></html>');
        
        win.document.close();
        
        win.print();
        win.close();
    },
    _buildCardsHTML: function() {

        var html = '';
        var total_cards = this.records.length; 
        var card_num = 0; 
        
        Ext.each(this.records, function(record){
            
            var value_html = '';
            //Todo organize by content or header...
            Ext.each(this.displayFields, function(df){
                var value = record.get(df.dataIndex);
                if ( df.renderer ) {
                    value = df.renderer(value,null,record);
                }
                df.maxLenth = df.maxLength || 0;
                if (df.maxLength > 0 && value.length > df.maxLength){
                    value = value.substring(0,df.maxLength);
                    value = value + this.truncateText;
                }
                value_html += Ext.String.format('<div class="{0}">{1}</div>',df.cls,value);
            }, this);
            
            
            card_num ++; 
            var artifact_classes = "artifact";
            // for margin setting left vs right

            if ((card_num) % 2 === 0 ) {
                artifact_classes += " artifact_right";
            } else {
                artifact_classes += " artifact_left";
            }
            // for margin setting top vs. bottom
            if ( ((card_num) % 4 === 0) || ((card_num) % 4 == 3 ) ){
                artifact_classes += " artifact_bottom";
            } else {
                artifact_classes += " artifact_top";
            }
            html += Ext.String.format('<div class="{0}">{1}</div>', artifact_classes, value_html);
            
            if ((card_num) % 4 === 0) {
                html += '<div class="pb"></div>';
            } else if (card_num === total_cards - 1) {
                html += '<div class="cb">&nbsp;</div>';
            }
        },this);
        return html;  
    },
    _getStyleSheet: function(styleSheetTitle) {
        this.logger.log('getStyleSheet');
        var styleSheet;
        var docs = Ext.getDoc(); 
        var elems = docs.query('style');
        for (var i=0; i< elems.length; i++){
            if (elems[i].title == styleSheetTitle){
                styleSheet = elems[i];
            }
        }
        return styleSheet.innerHTML;
    }
});