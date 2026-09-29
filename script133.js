var estimadorsServices = angular.module('estimadorServices', ['app.services']);

estimadorsServices.factory('Estimador', ['baseDataService',
    function (baseDataService) {
        return baseDataService.getService('api/estimador', false, {
            estimar: { method: 'POST', url: 'api/estimador/estimar' }
        });
    }]);