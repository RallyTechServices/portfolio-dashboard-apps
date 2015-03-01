Ext.define("ReleasePlanningSummary", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'selector_box'},
        {xtype:'container',itemId:'display_box'},
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        this._addReleaseSelector(this.down('#selector_box'));
    },
    _addReleaseSelector: function(container) {
        container.add({
            xtype:'rallyreleasecombobox',
            listeners: {
                scope: this,
                change: function(rb, new_value, old_value) {
                    var filters = rb.getQueryFromSelected();
                    var me = this;
                    
                    var model_name = 'PortfolioItem/Feature',
                        field_names = ['FormattedID','Name','Release','UserStories'];
                                    
                    this._loadAStoreWithAPromise(model_name, field_names,filters).then({
                        scope: this,
                        success: function(store) {
                            this._displayGrid(store);
                        },
                        failure: function(error_message){
                            alert(error_message);
                        }
                    }).always(function() {
                        me.setLoading(false);
                    });
                }
            }
        });
    },
    _loadAStoreWithAPromise: function(model_name, model_fields,filters){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        this.logger.log("Starting load:",model_name,model_fields,filters);
          
        Ext.create('Rally.data.wsapi.Store', {
            model: model_name,
            fetch: model_fields,
            filters: filters
        }).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(this);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    _displayGrid: function(store){
        this.down('#display_box').removeAll();
        
        var columns = [
            {dataIndex: 'FormattedID', text:'id'},
            {dataIndex: "Name", text: "Name" },
            {dataIndex: "UserStories", text: "Story Count", renderer: function(value,meta_data,record){
                if ( !value ) {
                    return 0;
                }
                return value.Count;
            } }
        ]
        
        this.down('#display_box').add({
            xtype: 'rallygrid',
            store: store,
            columnCfgs: columns
        });
    }
});
