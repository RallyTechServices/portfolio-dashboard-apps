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
                    var feature_filter = rb.getQueryFromSelected();
                    var me = this;
                    
                    var story_filter = [{property:'PortfolioItem.Release.Name',value:rb.getRecord().get('Name')}];
                    
                    Deft.Promise.all([
                        this._getFeatureStore(feature_filter),
                        this._getStories(story_filter)
                    ]).then({
                        scope: this,
                        success: function(results) {
                            var feature_store = results[0];
                            var stories = results[1];
                            
                            this._displayGrid(feature_store,stories);
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
    
    _getStories: function(filters){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;

        this.logger.log("getting stories:",filters);
          
        Ext.create('Rally.data.wsapi.Store', {
            limit:'Infinity',
            model: 'HierarchicalRequirement',
            fetch: ['FormattedID','PortfolioItem','ScheduleState','PlanEstimate','Iteration','Name'],
            filters: filters
        }).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem getting stories: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    
    _getFeatureStore: function(filters){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var model_name = 'PortfolioItem/Feature',
            field_names = ['FormattedID','Name','Release','UserStories','UnEstimatedLeafStoryCount','LeafStoryPlanEstimateTotal'];
                        
        this.logger.log("Starting load:",filters);
          
        Ext.create('Rally.data.wsapi.Store', {
            model: model_name,
            fetch: field_names,
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
    _displayGrid: function(store,stories){
        this.down('#display_box').removeAll();
        this.logger.log("Grid:", store, stories);
        
        var stories_by_feature = this._getStoriesByFeature(stories);
        
        this._calculate(store.getRecords(), stories_by_feature);
        
        store.on('load',function(store,records) {
            this._calculate(records,stories);
        }, this);
        
        var columns = [
            {dataIndex: 'FormattedID', text:'id'},
            {dataIndex: "Name", text: "Name" },
            {dataIndex: "Release", text: "Release" },
            {dataIndex: "UserStories", text: "Story Count", renderer: function(value,meta_data,record){
                if ( !value ) {
                    return 0;
                }
                return value.Count;
            } },
            { dataIndex: "UnEstimatedLeafStoryCount", text: "Unestimated Stories" },
            { dataIndex: "LeafStoryPlanEstimateTotal", text: "Total Points" }
        ]
        
        this.down('#display_box').add({
            xtype: 'rallygrid',
            store: store,
            columnCfgs: columns
        });
    },
    _getStoriesByFeature: function(stories) {
        var stories_by_feature = {};
        
        Ext.Array.each(stories,function(story){
            var feature = story.get('PortfolioItem').FormattedID;
            if ( !stories_by_feature[feature] ) {
                stories_by_feature[feature] = [];
            }
            stories_by_feature[feature].push(story);
        });
        return stories_by_feature;
    },
    
    _calculate: function(features,stories_by_feature){
        this.logger.log("features:",features);
        this.logger.log("stories:", stories_by_feature);
        Ext.Array.each(features, function(feature) {
            var stories = stories_by_feature[feature.get('FormattedID')];
            feature.set('_stories', stories);
            feature.set('_stories_unestimated', this._getUnestimatedStories(stories));
        },this);
    },
    
    _getUnestimatedStories: function(stories) {
        var unestimated_stories = [];
        Ext.Array.each(stories, function(story) {
            var plan_estimate = story.get('PlanEstimate');
            if ( isNaN(plan_estimate) ) {
                unestimated_stories.push(story);
            }
        });
        return unestimated_stories;
    }
});
