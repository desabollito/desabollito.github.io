var compradorsServices = angular.module('compradorServices', ['app.services']);

compradorsServices.factory('Comprador', ['baseDataService',
    function (baseDataService) {
        return baseDataService.getService('api/compradores', true, {
            saveList: { method: 'POST' },
            enviarCodigoEmail: { method: 'POST', url: 'api/compradores/enviarCodigoEmailComprador' },
        });
    }]);

